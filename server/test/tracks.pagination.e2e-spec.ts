import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import rawRequest from 'supertest';
import { fixtureActor, installAdmin } from './auth-fixture.js';
let fixtureToken = '';
const request = (server: Parameters<typeof rawRequest>[0]) => rawRequest.agent(server).set('Authorization', `Bearer ${fixtureToken}`);
import { assertIsolatedTestDatabase } from '../src/common/test-database.js';
import { ApiErrorFilter } from '../src/common/api-error.filter.js';
import { RequestIdMiddleware } from '../src/common/request-id.middleware.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { OpenAPIResponseValidatorArgs } from 'openapi-response-validator';
import { MaintenanceService } from '../src/maintenance/maintenance.service.js';

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error('MONGODB_URI is required for integration tests');
}
const testDatabase = new URL(mongoUri).pathname.slice(1);
assertIsolatedTestDatabase(testDatabase);
const OpenAPIResponseValidator = createRequire(import.meta.url)('openapi-response-validator').default as new (
  args: OpenAPIResponseValidatorArgs,
) => { validateResponse(statusCode: string, response: unknown): unknown };

const [{ AppModule }, { Test }, { getModelToken }, { Track }, { Comment }, { TrackService }] = await Promise.all([
  import('../src/app.module.js'),
  import('@nestjs/testing'),
  import('@nestjs/mongoose'),
  import('../src/track/schemas/track.schema.js'),
  import('../src/comment/schemas/comment.schema.js'),
  import('../src/track/track.service.js'),
]);

const openApi = JSON.parse(
  readFileSync(fileURLToPath(new URL('../openapi.json', import.meta.url)), 'utf8'),
) as {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
  components: unknown;
};

function expectContractResponse(path: string, method: string, status: number, body: unknown): void {
  const operation = openApi.paths[path]?.[method];
  if (!operation) throw new Error(`Missing OpenAPI operation ${method.toUpperCase()} ${path}`);
  const validator = new OpenAPIResponseValidator({
    responses: operation.responses as OpenAPIResponseValidatorArgs['responses'],
    components: openApi.components as OpenAPIResponseValidatorArgs['components'],
  });
  expect(validator.validateResponse(String(status), body)).toBeUndefined();
}

describe('GET /tracks cursor API (Mongo integration)', () => {
  let app: INestApplication;
  let trackModel: Model<InstanceType<typeof Track>>;
  let commentModel: Model<InstanceType<typeof Comment>>;
  let trackService: InstanceType<typeof TrackService>;
  let insertedIds: Types.ObjectId[] = [];
  let insertedCommentIds: Types.ObjectId[] = [];

  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 202 })));
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
    app.useGlobalFilters(new ApiErrorFilter());
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }));
    await app.init();
    fixtureToken = await installAdmin(app);
    trackModel = app.get(getModelToken(Track.name));
    commentModel = app.get(getModelToken(Comment.name));
    trackService = app.get(TrackService);
  });

  afterAll(async () => {
    if (insertedCommentIds.length > 0) {
      await commentModel.deleteMany({ _id: { $in: insertedCommentIds } }).exec();
    }
    if (insertedIds.length > 0) {
      await trackModel.deleteMany({ _id: { $in: insertedIds } }).exec();
    }
    await app?.close();
    vi.unstubAllGlobals();
  });

  it.each([0, 1, 20, 21, 40, 41])('traverses %i fixture tracks once', async (count) => {
    if (insertedIds.length > 0) {
      await trackModel.deleteMany({ _id: { $in: insertedIds } }).exec();
      insertedIds = [];
    }
    const documents = Array.from({ length: count }, (_, index) => ({
      name: `pagination-fixture-${index}`,
      audio: `fixture-${index}.mp3`,
      listens: index,
    }));
    if (documents.length > 0) {
      const inserted = await trackModel.insertMany(documents);
      insertedIds = inserted.map((track) => track._id);
    }
    const expected = [...insertedIds].map(String).sort();
    const actual: string[] = [];
    let cursor: string | null = null;

    do {
      const response: {
        body: { items: { _id: string }[]; nextCursor: string | null };
      } = await request(app.getHttpServer())
        .get('/tracks')
        .query({ count: 20, ...(cursor ? { cursor } : {}) })
        .expect(200);
      actual.push(...response.body.items.map((item: { _id: string }) => item._id));
      cursor = response.body.nextCursor;
    } while (cursor);

    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(count);
  });

  it('exposes liveness and Mongo primary readiness', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
    await request(app.getHttpServer()).get('/health/ready').expect(200, { status: 'ok' });
  });

  it('uses a sanitized request ID and returns a stable validation envelope', async () => {
    const valid = await request(app.getHttpServer())
      .post('/tracks/507f1f77bcf86cd799439011/comments')
      .set('x-request-id', 'web.client:request-123')
      .send({ trackId: 'invalid', username: '', text: '' })
      .expect(400);
    expectContractResponse('/tracks/{trackId}/comments', 'post', 400, valid.body);
    expect(valid.headers['x-request-id']).toBe('web.client:request-123');
    expect(valid.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        requestId: 'web.client:request-123',
        fieldErrors: expect.objectContaining({

          text: expect.any(Array),
        }),
      },
    });
    expect(JSON.stringify(valid.body)).not.toMatch(/stack|mongodb/i);

    const notFound = await request(app.getHttpServer())
      .get(`/tracks/${String(new Types.ObjectId())}`)
      .expect(404);
    expectContractResponse('/tracks/{id}', 'get', 404, notFound.body);
    expect(notFound.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(notFound.headers['x-request-id']).toBe(notFound.body.error.requestId);

    const invalidId = await request(app.getHttpServer())
      .get('/tracks/not-an-id')
      .set('x-request-id', 'bad id')
      .expect(400);
    expect(invalidId.headers['x-request-id']).toMatch(/^[\da-f-]{36}$/i);
    expect(invalidId.body.error.requestId).toBe(invalidId.headers['x-request-id']);
  });

  it('returns a generic internal error without leaking diagnostics', async () => {
    const spy = vi.spyOn(trackService, 'getOne').mockRejectedValueOnce(
      new Error('mongodb://private:password@database/internal stack trace'),
    );
    const response = await request(app.getHttpServer())
      .get(`/tracks/${String(new Types.ObjectId())}`)
      .expect(500);
    expectContractResponse('/tracks/{id}', 'get', 500, response.body);
    expect(response.body).toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: expect.any(String),
      },
    });
    expect(response.headers['x-request-id']).toBe(response.body.error.requestId);
    expect(JSON.stringify(response.body)).not.toMatch(/password|database|stack trace|mongodb/i);
    spy.mockRestore();
  });

  it('serializes normalized track and comment transport fields over HTTP', async () => {
    const track = await trackModel.create({ name: 'contract-fixture', audio: 'contract-fixture.mp3' });
    insertedIds.push(track._id);

    const page = await request(app.getHttpServer()).get('/tracks?count=100').expect(200);
    expectContractResponse('/tracks', 'get', 200, page.body);
    const listItem = page.body.items.find((item: { _id: string }) => item._id === String(track._id));
    expect(listItem).toMatchObject({
      _id: String(track._id),
      name: 'contract-fixture',
      artist: null,
      picture: null,
      duration: null,
      listens: 0,
    });
    expect(listItem.audio).toMatch(/^https?:\/\/[^/]+\/static\/audio\/contract-fixture\.mp3$/);
    expect(listItem).not.toHaveProperty('lyrics');

    const detail = await request(app.getHttpServer()).get(`/tracks/${String(track._id)}`).expect(200);
    expectContractResponse('/tracks/{id}', 'get', 200, detail.body);
    expect(detail.body).toMatchObject({
      _id: String(track._id),
      artist: null,
      picture: null,
      duration: null,
      lyrics: null,
      ownerId: null,
    });
    expect(detail.body).not.toHaveProperty('comments');
    expect(detail.body.audio).toMatch(/^https?:\/\/[^/]+\/static\/audio\/contract-fixture\.mp3$/);

    const created = await request(app.getHttpServer()).post(`/tracks/${String(track._id)}/comments`).send({
      username: '  Contract Tester  ',
      text: '  preserves comment spacing  ',
      trackId: String(track._id),
    }).expect(201);
    expectContractResponse('/tracks/{trackId}/comments', 'post', 201, created.body);
    insertedCommentIds.push(new Types.ObjectId(created.body._id));
    expect(created.body).toMatchObject({
      _id: expect.any(String),
      trackId: String(track._id),
      authorId: fixtureActor.id,
      username: 'Contract Tester',
      text: '  preserves comment spacing  ',
      rating: null,
    });
    expect(new Date(created.body.createdAt).toISOString()).toBe(created.body.createdAt);
    expect(created.body).not.toHaveProperty('track_id');

    const commentPage = await request(app.getHttpServer())
      .get(`/tracks/${String(track._id)}/comments`)
      .query({ count: 1 })
      .expect(200);
    expectContractResponse('/tracks/{trackId}/comments', 'get', 200, commentPage.body);
    expect(commentPage.body.items).toHaveLength(1);
    expect(commentPage.body.items[0]).toMatchObject({
      _id: created.body._id,
      trackId: String(track._id),
      authorId: fixtureActor.id,
      username: 'Contract Tester',
    });

    const resourceCreated = await request(app.getHttpServer())
      .post(`/tracks/${String(track._id)}/comments`)
      .send({ username: 'Resource API', text: 'New route comment', rating: 9 })
      .expect(201);
    expectContractResponse('/tracks/{trackId}/comments', 'post', 201, resourceCreated.body);
    insertedCommentIds.push(new Types.ObjectId(resourceCreated.body._id));
    expect(resourceCreated.body).toMatchObject({ trackId: String(track._id), rating: 9 });

    const resourcePage = await request(app.getHttpServer())
      .get(`/tracks/${String(track._id)}/comments`)
      .query({ count: 1 })
      .expect(200);
    expectContractResponse('/tracks/{trackId}/comments', 'get', 200, resourcePage.body);
    expect(resourcePage.body.items).toHaveLength(1);
    expect(resourcePage.body.items[0].text).toBe('New route comment');
    await request(app.getHttpServer()).get('/tracks/not-an-id/comments').expect(400);
    await request(app.getHttpServer()).get(`/tracks/${String(new Types.ObjectId())}/comments`).expect(404);
    await request(app.getHttpServer())
      .delete(`/comments/${resourceCreated.body._id}`)
      .expect(200);
    expectContractResponse('/comments/{commentId}', 'delete', 200, resourceCreated.body);
  });

  it('uses scoped cursor search pages and explicit catalogue mappers', async () => {
    const inserted = await trackModel.insertMany([
      { name: 'search-scope-alpha', audio: 'search-a.mp3', text: 'private lyrics' },
      { name: 'search-scope-beta', audio: 'search-b.mp3' },
      { name: 'literal.+token', audio: 'literal.mp3' },
    ]);
    insertedIds.push(...inserted.map((track) => track._id));

    const first = await request(app.getHttpServer())
      .get('/tracks/search')
      .query({ query: 'search-scope', count: 1 })
      .expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0]).not.toHaveProperty('lyrics');
    expect(first.body.items[0].audio).toMatch(/\/static\/audio\//);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await request(app.getHttpServer())
      .get('/tracks/search')
      .query({ query: 'search-scope', count: 1, cursor: first.body.nextCursor })
      .expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0]._id).not.toBe(first.body.items[0]._id);
    await request(app.getHttpServer())
      .get('/tracks/search')
      .query({ query: 'different-filter', count: 1, cursor: first.body.nextCursor })
      .expect(400);

    const escaped = await request(app.getHttpServer())
      .get('/tracks/search')
      .query({ query: '.+', count: 20 })
      .expect(200);
    expect(escaped.body.items.map((item: { _id: string }) => item._id)).toContain(String(inserted[2]._id));
    expect(escaped.body.items).toHaveLength(1);
  });

  it('bounds comments and scopes their cursor to the requested track', async () => {
    const [trackA, trackB] = await trackModel.insertMany([
      { name: 'comment-page-a', audio: 'comments-a.mp3' },
      { name: 'comment-page-b', audio: 'comments-b.mp3' },
    ]);
    insertedIds.push(trackA._id, trackB._id);
    const comments = await commentModel.insertMany([
      { track_id: trackA._id, username: 'A1', text: 'one' },
      { track_id: trackA._id, username: 'A2', text: 'two' },
      { track_id: trackA._id, username: 'A3', text: 'three' },
      { track_id: trackA._id, username: 'legacy', text: 'must stay quarantined', migrationQuarantineId: '002-comment-parents' },
      { track_id: trackB._id, username: 'B1', text: 'other track' },
    ]);
    insertedCommentIds.push(...comments.map((comment) => comment._id));

    const first = await request(app.getHttpServer())
      .get(`/tracks/${String(trackA._id)}/comments`)
      .query({ count: 2 })
      .expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    expect(first.body.items.every((comment: { trackId: string }) => comment.trackId === String(trackA._id))).toBe(true);

    const last = await request(app.getHttpServer())
      .get(`/tracks/${String(trackA._id)}/comments`)
      .query({ count: 2, cursor: first.body.nextCursor })
      .expect(200);
    expect(last.body.items).toHaveLength(1);
    expect(last.body.nextCursor).toBeNull();
    expect(new Set([...first.body.items, ...last.body.items].map((comment: { _id: string }) => comment._id)).size).toBe(3);
    expect([...first.body.items, ...last.body.items].some((comment: { text: string }) => comment.text === 'must stay quarantined')).toBe(false);
    const quarantined = comments.find((comment) => comment.text === 'must stay quarantined')!;
    await request(app.getHttpServer()).delete(`/comments/${String(quarantined._id)}`).expect(404);
    expect(await commentModel.findById(quarantined._id).lean().exec()).not.toBeNull();

    await request(app.getHttpServer())
      .get(`/tracks/${String(trackB._id)}/comments`)
      .query({ count: 2, cursor: first.body.nextCursor })
      .expect(400);
  });

  it('serializes comment creation against track deletion and leaves no active orphan', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const track = await trackModel.create({ name: `comment-delete-race-${attempt}`, audio: `race-${attempt}.mp3` });
      insertedIds.push(track._id);
      const race = Promise.all([
        request(app.getHttpServer()).post(`/tracks/${String(track._id)}/comments`)
          .send({ username: 'Race', text: `race ${attempt}` }),
        request(app.getHttpServer()).delete(`/tracks/${String(track._id)}`),
      ]);
      let raceTimeout: ReturnType<typeof setTimeout> | undefined;
      const [create, deletion] = await Promise.race([
        race,
        new Promise<never>((_, reject) => { raceTimeout = setTimeout(() => reject(new Error('Comment/delete HTTP race timed out')), 8_000); }),
      ]);
      if (raceTimeout) clearTimeout(raceTimeout);
      expect([201, 404]).toContain(create.status);
      expect(deletion.status).toBe(202);
      if (create.status === 201) insertedCommentIds.push(new Types.ObjectId(create.body._id));

      const maintenance = app.get(MaintenanceService);
      for (let retry = 0; retry < 10; retry += 1) {
        await maintenance.runOnce();
        const remaining = await commentModel.countDocuments({ track_id: track._id }).exec();
        if (remaining === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(await commentModel.countDocuments({ track_id: track._id }).exec()).toBe(0);
      const storedTrack = await trackModel.findById(track._id).lean().exec();
      expect(['deleting', 'deleted']).toContain(storedTrack?.lifecycle);
      expect(storedTrack?.commentWriteRevision).toBeGreaterThanOrEqual(0);
    }
  }, 30_000);

  it('rejects invalid multipart and comment writes before persistence', async () => {
    await request(app.getHttpServer())
      .post('/tracks')
      .field('name', '   ')
      .field('duration', '12')
      .attach('picture', Buffer.from('image'), { filename: 'cover.png', contentType: 'image/png' })
      .attach('audio', Buffer.from('audio'), { filename: 'track.mp3', contentType: 'audio/mpeg' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/tracks')
      .field('name', 'Valid name')
      .field('duration', '1e2')
      .attach('picture', Buffer.from('image'), { filename: 'cover.png', contentType: 'image/png' })
      .attach('audio', Buffer.from('audio'), { filename: 'track.mp3', contentType: 'audio/mpeg' })
      .expect(400);

    await request(app.getHttpServer()).post('/tracks/507f1f77bcf86cd799439011/comments').send({
      username: '  ',
      text: '   ',
      trackId: '507f1f77bcf86cd799439011',
    }).expect(400);
    await request(app.getHttpServer()).post('/tracks/507f1f77bcf86cd799439011/comments').send({
      username: 'Valid',
      text: 'x'.repeat(5_001),
      trackId: '507f1f77bcf86cd799439011',
    }).expect(400);
  });

  it('transforms valid multipart write fields before the service boundary', async () => {
    const create = vi.spyOn(trackService, 'create').mockResolvedValue({} as never);
    try {
      await request(app.getHttpServer())
        .post('/tracks')
        .field('name', '  Valid title  ')
        .field('artist', '  Valid artist  ')
        .field('text', '  first line\n second line  ')
        .field('duration', '12.5')
        .attach('picture', Buffer.from('image'), { filename: 'cover.png', contentType: 'image/png' })
        .attach('audio', Buffer.from('audio'), { filename: 'track.mp3', contentType: 'audio/mpeg' })
        .expect(201);

      expect(create).toHaveBeenCalledOnce();
      expect(create.mock.calls[0][0]).toMatchObject({
        name: 'Valid title',
        artist: 'Valid artist',
        text: '  first line\n second line  ',
        duration: 12.5,
      });
      expect(create.mock.calls[0][0]).not.toHaveProperty('picture');
      expect(create.mock.calls[0][0]).not.toHaveProperty('audio');
    } finally {
      create.mockRestore();
    }
  });

  it('continues after a boundary document is deleted', async () => {
    if (insertedIds.length > 0) {
      await trackModel.deleteMany({ _id: { $in: insertedIds } }).exec();
    }
    const inserted = await trackModel.insertMany([
      { name: 'boundary-a', audio: 'a.mp3' },
      { name: 'boundary-b', audio: 'b.mp3' },
      { name: 'boundary-c', audio: 'c.mp3' },
    ]);
    insertedIds = inserted.map((track) => track._id);
    const first = await request(app.getHttpServer())
      .get('/tracks?count=1')
      .expect(200);
    const boundaryId = first.body.items[0]._id;
    await trackModel.findByIdAndDelete(boundaryId).exec();
    insertedIds = insertedIds.filter((id) => String(id) !== boundaryId);

    const next = await request(app.getHttpServer())
      .get('/tracks')
      .query({ count: 1, cursor: first.body.nextCursor })
      .expect(200);
    expect(next.body.items[0]._id).toBe(String(inserted[1]._id));
  });

  it('rejects invalid paging inputs before querying Mongo', async () => {
    const findSpy = vi.spyOn(trackModel, 'find');
    for (const url of [
      '/tracks?count=1.5',
      '/tracks?count=0',
      '/tracks?count=101',
      '/tracks?count=1&count=2',
      '/tracks?cursor=nope',
      '/tracks?offset=0',
    ]) {
      await request(app.getHttpServer()).get(url).expect(400);
    }
    expect(findSpy).not.toHaveBeenCalled();
    findSpy.mockRestore();
  });
});
