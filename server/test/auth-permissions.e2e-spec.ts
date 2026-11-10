import { afterAll, beforeAll, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { ObjectId, type Db } from 'mongodb';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiErrorFilter } from '../src/common/api-error.filter.js';
import { AppModule } from '../src/app.module.js';
import { assertIsolatedTestDatabase } from '../src/common/test-database.js';

assertIsolatedTestDatabase(new URL(process.env.MONGODB_URI!).pathname.slice(1));
let app: INestApplication;
let db: Db;
const actors = ['user', 'user', 'admin'].map((role) => ({ id: new ObjectId(), role, token: randomBytes(32).toString('base64url') }));
const trackId = new ObjectId();
const legacyId = new ObjectId();
let commentId: string;
beforeAll(async () => {
  app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  app.useGlobalFilters(new ApiErrorFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  db = app.get(getConnectionToken()).db;
  for (const actor of actors) {
    await db.collection('users').insertOne({ _id: actor.id, username: `permission_${String(actor.id)}`, displayName: 'Trusted identity', role: actor.role, disabled: false });
    await db.collection('sessions').insertOne({ userId: actor.id, tokenHash: createHash('sha256').update(actor.token).digest('hex'), expiresAt: new Date(Date.now() + 600000), revokedAt: null });
  }
  await db.collection('tracks').insertMany([
    { _id: trackId, name: 'owned', lifecycle: 'active', ownerId: actors[0].id },
    { _id: legacyId, name: 'legacy', lifecycle: 'active' },
  ]);
});
afterAll(async () => {
  await db.collection('queues').deleteMany({ userId: { $in: actors.map((a) => a.id) } });
  await db.collection('users').deleteMany({ _id: { $in: actors.map((a) => a.id) } });
  await db.collection('sessions').deleteMany({ userId: { $in: actors.map((a) => a.id) } });
  await db.collection('comments').deleteMany({ track_id: { $in: [trackId, legacyId] } });
  await db.collection('tracks').deleteMany({ _id: { $in: [trackId, legacyId] } });
  await app.close();
});

it('keeps reads public and rejects forged identity before upload interception', async () => {
  await request(app.getHttpServer()).get(`/tracks/${String(trackId)}`).expect(200);
  await request(app.getHttpServer()).post('/tracks').set('x-user-id', String(actors[2].id)).expect(401);
  await request(app.getHttpServer()).post(`/tracks/${String(trackId)}/comments`).send({ text: 'anonymous' }).expect(401);
});
it.each([-1, 0, 1, 2])('checks public reads/listen and comment mutations for actor %s', async (index) => {
  const call = (method: 'get' | 'post' | 'delete', url: string) => {
    const pending = request(app.getHttpServer())[method](url);
    return index < 0 ? pending : pending.auth(actors[index].token, { type: 'bearer' });
  };
  for (const url of ['/tracks', '/tracks/search?query=owned', `/tracks/${String(trackId)}`, `/tracks/${String(trackId)}/comments`]) {
    const response = await call('get', url).expect(200);
    if (url === `/tracks/${String(trackId)}`) {
      expect(response.body).toMatchObject({ _id: String(trackId), ownerId: String(actors[0].id), name: 'owned' });
    }
  }
  await call('post', `/tracks/${String(trackId)}/listen`).expect(201);
  const created = await call('post', `/tracks/${String(trackId)}/comments`).send({ text: 'Matrix comment' }).expect(index < 0 ? 401 : 201);
  if (index >= 0) await call('delete', `/comments/${created.body._id}`).expect(200);
  const legacy = new ObjectId();
  await db.collection('comments').insertOne({ _id: legacy, track_id: trackId, text: 'Legacy matrix', username: 'Legacy' });
  try { await call('delete', `/comments/${String(legacy)}`).expect(index < 0 ? 401 : index === 2 ? 200 : 403); }
  finally { await db.collection('comments').deleteOne({ _id: legacy }); }
});
it('derives comment identity and denies a different user even when that user owns the track', async () => {
  const created = await request(app.getHttpServer()).post(`/tracks/${String(trackId)}/comments`).auth(actors[1].token, { type: 'bearer' })
    .send({ text: 'Owned comment', username: 'forged', authorId: String(actors[0].id), role: 'admin' }).expect(201);
  commentId = created.body._id;
  expect(created.body).toMatchObject({ authorId: String(actors[1].id), username: 'Trusted identity' });
  await request(app.getHttpServer()).delete(`/comments/${commentId}`).auth(actors[0].token, { type: 'bearer' }).expect(403);
  await request(app.getHttpServer()).delete(`/comments/${commentId}`).auth(actors[1].token, { type: 'bearer' }).expect(200);
});
it('isolates queues, resolves duplicates and serializes initial and capacity-edge writes', async () => {
  await db.collection('queues').createIndex({ userId: 1 }, { unique: true, name: 'queue_user_unique' });
  await db.collection('tracks').updateOne({ _id: trackId }, { $set: { audio: 'fixture.mp3' } });
  const call = (method: 'get' | 'put', actor = 0) => request(app.getHttpServer())[method]('/queue').auth(actors[actor].token, { type: 'bearer' });
  await request(app.getHttpServer()).get('/queue').expect(401);
  expect((await call('get').expect(200)).body).toMatchObject({ revision: 0, entries: [], updatedAt: null, capacity: 100 });
  const entries = Array.from({ length: 99 }, () => ({ entryId: randomUUID(), trackId: String(trackId) }));
  const firstWrites = [0, 1].map(() => ({ expectedRevision: 0, mutationId: randomUUID(), entries }));
  const first = await Promise.all(firstWrites.map((body) => call('put').send(body)));
  expect(first.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
  const winner = first.findIndex((r) => r.status === 200);
  expect((await call('put').send(firstWrites[winner]).expect(200)).body.revision).toBe(1);
  await call('put').send({ ...firstWrites[winner], entries: [] }).expect(400);
  const writes = [0, 1].map(() => ({ expectedRevision: 1, mutationId: randomUUID(), entries: [...entries, { entryId: randomUUID(), trackId: String(trackId) }] }));
  const raced = await Promise.all(writes.map((body) => call('put').send(body)));
  expect(raced.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
  const canonical = (await call('get').expect(200)).body;
  expect(canonical.entries).toHaveLength(100);
  expect(canonical.revision).toBe(2);
  const overflow = await call('put').send({ expectedRevision: 2, mutationId: randomUUID(), entries: [...entries, ...entries.slice(0, 2)] }).expect(400);
  expect(overflow.body.error.code).toBe('QUEUE_FULL');
  await call('put').send({ expectedRevision: 2, mutationId: randomUUID(), entries: [{ entryId: randomUUID(), trackId: new ObjectId().toHexString() }] }).expect(400);
  expect((await call('get', 1).expect(200)).body.entries).toEqual([]);
  await call('put', 1).send({ expectedRevision: 0, mutationId: randomUUID(), entries: [], userId: String(actors[0].id) }).expect(200);
  expect((await call('get').expect(200)).body.revision).toBe(2);
  await db.collection('tracks').updateOne({ _id: trackId }, { $set: { lifecycle: 'deleting' } });
  const unavailable = (await call('get').expect(200)).body;
  expect(unavailable.revision).toBe(2);
  expect(unavailable.entries.every((entry: { track: unknown; availability: string }) => entry.track === null && entry.availability === 'unavailable')).toBe(true);
  await call('put').send({ expectedRevision: 2, mutationId: randomUUID(), entries: canonical.entries.map((entry: { entryId: string; trackId: string }) => ({ entryId: entry.entryId, trackId: entry.trackId })) }).expect(200);
  await db.collection('tracks').updateOne({ _id: trackId }, { $set: { lifecycle: 'active' } });
});
it('resolves a guest batch without reading deleted metadata or incrementing listens', async () => {
  const deleted = new ObjectId();
  await db.collection('tracks').insertOne({ _id: deleted, lifecycle: 'deleted', name: 'private removed metadata', audio: 'secret.mp3' });
  const before = await db.collection('tracks').findOne({ _id: trackId });
  try {
    const response = await request(app.getHttpServer()).post('/tracks/resolve').send({ ids: [String(deleted), String(trackId)] }).expect(200);
    expect(response.body.items[0]).toEqual({ trackId: String(deleted), track: null, availability: 'unavailable', reason: 'deleted' });
    expect(response.body.items[1].track._id).toBe(String(trackId));
    expect(JSON.stringify(response.body)).not.toContain('private removed metadata');
    expect((await db.collection('tracks').findOne({ _id: trackId }))?.listens).toBe(before?.listens);
    for (const ids of [[], ['bad'], [String(trackId), String(trackId)], Array.from({ length: 101 }, () => String(trackId))]) {
      await request(app.getHttpServer()).post('/tracks/resolve').send({ ids }).expect(400);
    }
  } finally { await db.collection('tracks').deleteOne({ _id: deleted }); }
});
it('denies foreign and legacy track deletion while allowing admin deletion', async () => {
  await request(app.getHttpServer()).delete(`/tracks/${String(trackId)}`).auth(actors[1].token, { type: 'bearer' }).expect(403);
  await request(app.getHttpServer()).delete(`/tracks/${String(legacyId)}`).auth(actors[0].token, { type: 'bearer' }).expect(403);
  await request(app.getHttpServer()).delete(`/tracks/${String(legacyId)}`).auth(actors[2].token, { type: 'bearer' }).expect(202);
  await request(app.getHttpServer()).delete(`/tracks/${String(trackId)}`).auth(actors[0].token, { type: 'bearer' }).expect(202);
});

it.each([-1, 0, 1, 2])('allows track deletion only to its owner or an admin: actor %s', async (index) => {
  const id = new ObjectId();
  await db.collection('tracks').insertOne({ _id: id, name: 'delete permission matrix', lifecycle: 'active', ownerId: actors[0].id });
  try {
    const pending = request(app.getHttpServer()).delete(`/tracks/${String(id)}`)
      .set('x-user-id', String(actors[0].id))
      .set('x-user-role', 'admin')
      .send({ ownerId: String(actors[1].id), userId: String(actors[0].id), role: 'admin' });
    if (index >= 0) pending.auth(actors[index].token, { type: 'bearer' });
    const allowed = index === 0 || index === 2;
    const response = await pending.expect(allowed ? 202 : index < 0 ? 401 : 403);
    const stored = await db.collection('tracks').findOne({ _id: id });
    expect(stored?.ownerId).toEqual(actors[0].id);
    expect(stored?.lifecycle).toBe(allowed ? 'deleting' : 'active');
    const operations = await db.collection('mediaoperations').find({ trackId: id }).toArray();
    const events = await db.collection('cacheevents').find({ trackId: id }).toArray();
    expect(operations).toHaveLength(allowed ? 1 : 0);
    expect(events).toHaveLength(allowed ? 1 : 0);
    if (allowed) {
      // Repeated deletion cannot bypass permissions or create another cleanup job.
      await request(app.getHttpServer()).delete(`/tracks/${String(id)}`).auth(actors[1].token, { type: 'bearer' }).expect(403);
      const repeated = await request(app.getHttpServer()).delete(`/tracks/${String(id)}`).auth(actors[index].token, { type: 'bearer' }).expect(202);
      expect(repeated.body.operationId).toBe(response.body.operationId);
      expect(await db.collection('mediaoperations').countDocuments({ trackId: id })).toBe(1);
      await request(app.getHttpServer()).get(`/tracks/${String(id)}`).expect(404);
    } else {
      await request(app.getHttpServer()).get(`/tracks/${String(id)}`).expect(200);
    }
  } finally {
    await db.collection('mediaoperations').deleteMany({ trackId: id });
    await db.collection('cacheevents').deleteMany({ trackId: id });
    await db.collection('tracks').deleteOne({ _id: id });
  }
});

it('rejects a revoked owner session without changing the track', async () => {
  const id = new ObjectId();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await db.collection('tracks').insertOne({ _id: id, name: 'revoked owner', lifecycle: 'active', ownerId: actors[0].id });
  await db.collection('sessions').insertOne({ userId: actors[0].id, tokenHash, expiresAt: new Date(Date.now() + 600000), revokedAt: new Date() });
  try {
    await request(app.getHttpServer()).delete(`/tracks/${String(id)}`).auth(token, { type: 'bearer' }).expect(401);
    expect((await db.collection('tracks').findOne({ _id: id }))?.lifecycle).toBe('active');
    expect(await db.collection('mediaoperations').countDocuments({ trackId: id })).toBe(0);
    expect(await db.collection('cacheevents').countDocuments({ trackId: id })).toBe(0);
  } finally {
    await db.collection('tracks').deleteOne({ _id: id });
    await db.collection('sessions').deleteOne({ tokenHash });
  }
});
