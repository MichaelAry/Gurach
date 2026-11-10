import { afterAll, beforeAll, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { ObjectId, type Db } from 'mongodb';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ApiErrorFilter } from '../src/common/api-error.filter.js';
import { assertIsolatedTestDatabase } from '../src/common/test-database.js';

assertIsolatedTestDatabase(new URL(process.env.MONGODB_URI!).pathname.slice(1));
let app: INestApplication;
let db: Db;
const actors = [0, 1].map(() => ({ id: new ObjectId(), token: randomBytes(32).toString('base64url') }));
const owned = [new ObjectId(), new ObjectId()];
const foreign = new ObjectId(), deleted = new ObjectId(), silent = new ObjectId();
const auth = (method: 'get' | 'post' | 'put' | 'delete', path: string, actor = 0) => request(app.getHttpServer())[method](path).auth(actors[actor].token, { type: 'bearer' });

beforeAll(async () => {
  app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  app.useGlobalFilters(new ApiErrorFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  db = app.get(getConnectionToken()).db;
  for (const actor of actors) {
    await db.collection('users').insertOne({ _id: actor.id, username: `account_${String(actor.id)}`, displayName: 'Account tester', role: 'user', disabled: false });
    await db.collection('sessions').insertOne({ userId: actor.id, tokenHash: createHash('sha256').update(actor.token).digest('hex'), expiresAt: new Date(Date.now() + 600000), revokedAt: null });
  }
  await db.collection('tracks').insertMany([
    ...owned.map((_id, index) => ({ _id, name: `Own ${index}`, ownerId: actors[0].id, lifecycle: 'active', audio: 'fixture.mp3', listens: 3 })),
    { _id: foreign, name: 'Foreign', ownerId: actors[1].id, lifecycle: 'active', audio: 'fixture.mp3', listens: 7 },
    { _id: deleted, name: 'Removed private metadata', ownerId: actors[0].id, lifecycle: 'deleted', listens: 99 },
    { _id: silent, name: 'No audio', ownerId: actors[1].id, lifecycle: 'active' },
  ]);
  await db.collection('comments').insertMany([
    { authorId: actors[0].id, track_id: foreign, username: 'tester', text: 'Own comment' },
    { authorId: actors[1].id, track_id: owned[0], username: 'other', text: 'Foreign comment' },
  ]);
});

afterAll(async () => {
  const users = actors.map((actor) => actor.id);
  await db.collection('accountfavorites').deleteMany({ userId: { $in: users } });
  await db.collection('accountlistens').deleteMany({ userId: { $in: users } });
  await db.collection('comments').deleteMany({ authorId: { $in: users } });
  await db.collection('tracks').deleteMany({ _id: { $in: [...owned, foreign, deleted, silent] } });
  await db.collection('sessions').deleteMany({ userId: { $in: users } });
  await db.collection('users').deleteMany({ _id: { $in: users } });
  await app.close();
});

it('requires a session and never accepts a supplied account identity', async () => {
  for (const resource of ['statistics', 'uploads', 'history', 'favorites', 'favorite-ids']) {
    await request(app.getHttpServer()).get(`/account/${resource}`).set('x-user-id', String(actors[0].id)).expect(401);
    const response = await auth('get', `/account/${resource}`).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
  }
  await auth('get', `/account/uploads?userId=${String(actors[1].id)}`).expect(400);
  await request(app.getHttpServer()).post('/account/listens').send({ trackId: String(owned[0]), playbackId: randomUUID() }).expect(401);
});

it('counts owned uploads and comments, excludes deleted uploads, and starts history at zero', async () => {
  expect((await auth('get', '/account/statistics').expect(200)).body).toEqual({ uploadedTracks: 2, totalListens: 0, uniqueTracks: 0, receivedListens: 6, comments: 1 });
  expect((await auth('get', '/account/history').expect(200)).body).toEqual({ items: [], nextCursor: null });
});

it('paginates owned uploads with account-scoped cursors', async () => {
  const first = (await auth('get', '/account/uploads?count=1').expect(200)).body;
  expect(first.items).toHaveLength(1);
  expect(owned.map(String)).toContain(first.items[0]._id);
  const second = (await auth('get', `/account/uploads?count=1&cursor=${first.nextCursor}`).expect(200)).body;
  expect(second.items).toHaveLength(1);
  expect(second.items[0]._id).not.toBe(first.items[0]._id);
  expect(second.nextCursor).toBeNull();
  await auth('get', `/account/uploads?cursor=${first.nextCursor}`, 1).expect(400);
  await auth('get', `/account/history?cursor=${first.nextCursor}`).expect(400);
  for (const query of ['count=0', 'count=101', 'count=1&count=2', 'cursor=bad']) await auth('get', `/account/history?${query}`).expect(400);
});

it('commits one listen and global increment for concurrent retries, retaining distinct replays', async () => {
  const body = { trackId: String(owned[0]), playbackId: randomUUID(), userId: String(actors[1].id) };
  const results = await Promise.all([0, 1].map(() => auth('post', '/account/listens').send(body).expect(200)));
  expect(results[0].body).toEqual({ listens: 4 });
  expect(results[1].body).toEqual({ listens: 4 });
  expect(await db.collection('accountlistens').countDocuments({ userId: actors[0].id })).toBe(1);
  expect((await db.collection('tracks').findOne({ _id: owned[0] }))?.listens).toBe(4);
  await auth('post', '/account/listens').send({ ...body, trackId: String(foreign) }).expect(400);
  await auth('post', '/account/listens').send({ trackId: String(owned[0]), playbackId: randomUUID() }).expect(200);
  await auth('post', '/account/listens').send({ trackId: String(foreign), playbackId: randomUUID() }).expect(200);
  expect((await auth('get', '/account/statistics').expect(200)).body).toEqual({ uploadedTracks: 2, totalListens: 3, uniqueTracks: 2, receivedListens: 8, comments: 1 });
  expect((await auth('get', '/account/history', 1).expect(200)).body.items).toEqual([]);
  expect((await auth('get', '/account/statistics', 1).expect(200)).body).toMatchObject({ totalListens: 0, uniqueTracks: 0, receivedListens: 8 });
});

it('paginates history including repeats and hides removed track metadata', async () => {
  const first = (await auth('get', '/account/history?count=1').expect(200)).body;
  expect(first.items[0]).toMatchObject({ trackId: String(foreign), track: { _id: String(foreign) } });
  expect(Number.isNaN(Date.parse(first.items[0].listenedAt))).toBe(false);
  const second = (await auth('get', `/account/history?count=1&cursor=${first.nextCursor}`).expect(200)).body;
  expect(second.items[0].trackId).toBe(String(owned[0]));
  const third = (await auth('get', `/account/history?count=1&cursor=${second.nextCursor}`).expect(200)).body;
  expect(third.items[0].trackId).toBe(String(owned[0]));
  expect(third.items[0].id).not.toBe(second.items[0].id);
  expect(third.nextCursor).toBeNull();
  await db.collection('tracks').updateOne({ _id: foreign }, { $set: { lifecycle: 'deleted' } });
  const hidden = (await auth('get', '/account/history?count=1').expect(200)).body;
  expect(hidden.items[0].track).toBeNull();
  expect(JSON.stringify(hidden)).not.toContain('Foreign');
  expect((await auth('get', '/account/statistics').expect(200)).body).toMatchObject({ totalListens: 3, uniqueTracks: 2 });
});

it('rejects unavailable tracks and malformed events without recording a listen', async () => {
  for (const trackId of [String(deleted), String(silent), String(new ObjectId())]) {
    await auth('post', '/account/listens').send({ trackId, playbackId: randomUUID() }).expect(404);
  }
  await auth('post', '/account/listens').send({ trackId: 'bad', playbackId: 'bad' }).expect(400);
  expect(await db.collection('accountlistens').countDocuments({ userId: actors[0].id })).toBe(3);
});

it('persists favorites idempotently, isolates users, paginates and permits removal of deleted tracks', async () => {
  const path = `/account/favorites/${String(owned[0])}`;
  await request(app.getHttpServer()).put(path).expect(401);
  await request(app.getHttpServer()).delete(path).expect(401);
  await auth('put', '/account/favorites/bad').expect(400);
  await auth('put', `/account/favorites/${String(deleted)}`).expect(404);
  await auth('put', `/account/favorites/${String(new ObjectId())}`).expect(404);
  await Promise.all([auth('put', path).expect(204), auth('put', path).expect(204)]);
  expect(await db.collection('accountfavorites').countDocuments({ userId: actors[0].id })).toBe(1);
  await auth('put', `/account/favorites/${String(owned[1])}`).expect(204);
  expect((await auth('get', '/account/favorite-ids').expect(200)).body.sort()).toEqual(owned.map(String).sort());
  expect((await auth('get', '/account/favorite-ids', 1).expect(200)).body).toEqual([]);
  expect((await auth('get', '/account/favorites', 1).expect(200)).body.items).toEqual([]);
  const first = (await auth('get', '/account/favorites?count=1').expect(200)).body;
  expect(first.items[0]._id).toBe(String(owned[1]));
  const second = (await auth('get', `/account/favorites?count=1&cursor=${first.nextCursor}`).expect(200)).body;
  expect(second.items[0]._id).toBe(String(owned[0]));
  expect(second.nextCursor).toBeNull();
  await auth('get', `/account/favorites?cursor=${first.nextCursor}`, 1).expect(400);
  await auth('get', `/account/uploads?cursor=${first.nextCursor}`).expect(400);
  await auth('delete', path, 1).expect(204);
  expect((await auth('get', '/account/favorite-ids').expect(200)).body).toContain(String(owned[0]));
  await db.collection('tracks').updateOne({ _id: owned[0] }, { $set: { lifecycle: 'deleted' } });
  expect((await auth('get', '/account/favorites').expect(200)).body.items.map((item: { _id: string }) => item._id)).toEqual([String(owned[1])]);
  await auth('delete', path).expect(204);
  await auth('delete', path).expect(204);
  expect((await auth('get', '/account/favorite-ids').expect(200)).body).toEqual([String(owned[1])]);
});

it('rejects a revoked session without exposing account data or recording events', async () => {
  await db.collection('sessions').updateOne({ userId: actors[1].id }, { $set: { revokedAt: new Date() } });
  await auth('get', '/account/statistics', 1).expect(401);
  await auth('post', '/account/listens', 1).send({ trackId: String(owned[0]), playbackId: randomUUID() }).expect(401);
  expect(await db.collection('accountlistens').countDocuments({ userId: actors[1].id })).toBe(0);
});
