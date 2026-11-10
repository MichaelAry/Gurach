import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Db } from 'mongodb';
import { mkdir, mkdtemp, readdir, rm, stat, truncate, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import rawRequest from 'supertest';
import { fixtureActor, installAdmin } from './auth-fixture.js';
let fixtureToken = '';
const request = (server: Parameters<typeof rawRequest>[0]) => rawRequest.agent(server).set('Authorization', `Bearer ${fixtureToken}`);
import { assertIsolatedTestDatabase } from '../src/common/test-database.js';
import { ApiErrorFilter } from '../src/common/api-error.filter.js';
import { RequestIdMiddleware } from '../src/common/request-id.middleware.js';
import { env } from '../src/common/env.js';
import { FileService, FileType } from '../src/file/file.service.js';
import { MediaValidatorService } from '../src/file/media-validator.service.js';
import { TrackService } from '../src/track/track.service.js';
import { CacheEvent } from '../src/maintenance/schemas/cache-event.schema.js';
import { MaintenanceService } from '../src/maintenance/maintenance.service.js';
import { MediaOperation } from '../src/maintenance/schemas/media-operation.schema.js';
import { Track } from '../src/track/schemas/track.schema.js';
import { Comment } from '../src/comment/schemas/comment.schema.js';
import { UploadAdmissionService } from '../src/file/upload-admission.service.js';
import { StagingService } from '../src/file/staging.service.js';
import sharp from 'sharp';

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('MONGODB_URI is required for integration tests');
assertIsolatedTestDatabase(new URL(mongoUri).pathname.slice(1));

const [{ AppModule }, { Test }] = await Promise.all([
  import('../src/app.module.js'),
  import('@nestjs/testing'),
]);
const express = createRequire(import.meta.url)('express') as typeof import('express');

describe('POST /tracks disk staging (Mongo integration)', () => {
  let app: INestApplication;
  let temporaryRoot: string;
  let audioFixture: string;
  let pictureFixture: string;
  let trackService: InstanceType<typeof TrackService>;
  let mediaValidator: InstanceType<typeof MediaValidatorService>;
  let stagingService: InstanceType<typeof StagingService>;
  let database: Db;
  const operationIds: string[] = [];
  const createdTrackIds: string[] = [];
  const callbackRequests: { url: string; headers: Headers; body: string }[] = [];
  let nextCallbackResponse: Response | Error | undefined;

  const listStagingEntries = async () => readdir(env.mediaStagingDir).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });

  const trackOperations = () => {
    const createOperation = stagingService.createOperation.bind(stagingService);
    vi.spyOn(stagingService, 'createOperation').mockImplementation(async (operationId) => {
      operationIds.push(operationId);
      return createOperation(operationId);
    });
  };

  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      callbackRequests.push({
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        headers: new Headers(init?.headers),
        body: typeof init?.body === 'string' ? init.body : '',
      });
      const response = nextCallbackResponse;
      nextCallbackResponse = undefined;
      if (response instanceof Error) throw response;
      return response ?? new Response(null, { status: 202 });
    }));
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'gurach-upload-e2e-'));
    audioFixture = path.join(temporaryRoot, 'audio.mp3');
    pictureFixture = path.join(temporaryRoot, 'picture.png');
    await writeFile(audioFixture, Buffer.from([0xff, 0xfb, 0x90, 0x64, ...Array.from({ length: 128 }, () => 0)]));
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#269ac7' } }).png().toFile(pictureFixture);

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
    // TestingModule compiles before an HTTP adapter exists, so ServeStaticModule chooses its no-op loader.
    app.use('/static', express.static(env.staticDir));
    app.useGlobalFilters(new ApiErrorFilter());
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }));
    await app.init();
    fixtureToken = await installAdmin(app);
    trackService = app.get(TrackService);
    mediaValidator = app.get(MediaValidatorService);
    stagingService = app.get(StagingService);
    database = app.get(getConnectionToken()).db as Db;
    trackOperations();
  }, 30_000);

  afterAll(async () => {
    for (const id of createdTrackIds) await trackService.deleteOne(id, fixtureActor).catch(() => undefined);
    await app?.get(MaintenanceService).runOnce().catch(() => undefined);
    for (const id of operationIds) await stagingService.removeOperation(id).catch(() => undefined);
    await app?.close();
    vi.unstubAllGlobals();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (stagingService) trackOperations();
  });

  const expectOwnStagingClean = async () => {
    const current = await listStagingEntries();
    expect(current.filter((entry) => operationIds.includes(entry))).toEqual([]);
  };

  it('streams to private staging, validates, publishes atomically and preserves static URLs', async () => {
    vi.spyOn(mediaValidator, 'validateAudio').mockResolvedValue({ durationSeconds: 1.25, codec: 'mp3', container: 'mp3' });
    vi.spyOn(mediaValidator, 'validateCover').mockResolvedValue({ width: 8, height: 8, format: 'png', pages: 1 });

    const response = await request(app.getHttpServer())
      .post('/tracks')
      .field('name', '  Valid title  ')
      .field('artist', '  Valid artist  ')
      .field('text', '  first line\n second line  ')
      .field('duration', '12.5')
      .attach('picture', pictureFixture, { filename: 'cover.png', contentType: 'text/plain' })
      .attach('audio', audioFixture, { filename: 'song.mp3', contentType: 'text/plain' })
      .expect(201);

    expect(response.body).toMatchObject({ name: 'Valid title', artist: 'Valid artist', lyrics: '  first line\n second line  ', duration: 1.25 });
    createdTrackIds.push(response.body._id as string);
    const operationId = operationIds.at(-1)!;
    expect(response.body.audio).toMatch(/\/static\/audio\/[0-9a-f-]{36}\.mp3$/);
    expect(response.body.picture).toMatch(/\/static\/picture\/[0-9a-f-]{36}\.png$/);
    const audioPath = new URL(response.body.audio).pathname;
    const picturePath = new URL(response.body.picture).pathname;
    await expect(stat(path.join(env.staticDir, 'audio', path.basename(audioPath)))).resolves.toBeDefined();
    await expect(stat(path.join(env.staticDir, 'picture', path.basename(picturePath)))).resolves.toBeDefined();
    const servedAudio = await request(app.getHttpServer()).get(audioPath);
    expect(servedAudio.status, JSON.stringify({ audioPath, root: env.staticDir, body: servedAudio.body, text: servedAudio.text })).toBe(200);
    const rangedAudio = await request(app.getHttpServer()).get(audioPath).set('Range', 'bytes=0-3').expect(206);
    expect(rangedAudio.headers['content-range']).toMatch(/^bytes 0-3\//);
    expect(rangedAudio.body).toHaveLength(4);
    await request(app.getHttpServer()).get(picturePath).expect(200);
    const [trackRecord, operation, activationEvent] = await Promise.all([
      database.collection('tracks').findOne({ _id: new Types.ObjectId(response.body._id) }),
      database.collection('mediaoperations').findOne({ operationId }),
      database.collection('cacheevents').findOne({ eventId: `${operationId}:activated` }),
    ]);
    expect(trackRecord).toMatchObject({ lifecycle: 'active', audio: path.basename(audioPath), picture: path.basename(picturePath) });
    expect(operation).toMatchObject({ operationId, kind: 'upload', state: 'done', trackId: new Types.ObjectId(response.body._id) });
    expect(activationEvent).toMatchObject({ type: 'track.activated', state: 'pending', trackId: new Types.ObjectId(response.body._id) });
    await expectOwnStagingClean();

    await trackService.deleteOne(response.body._id, fixtureActor);
    await app.get(MaintenanceService).runOnce();
    createdTrackIds.splice(createdTrackIds.indexOf(response.body._id), 1);
  }, 30_000);

  it('does not expose private staging through the public static mount', async () => {
    const operationId = `private_${randomUUID()}`;
    operationIds.push(operationId);
    const operationPath = await stagingService.createOperation(operationId);
    const staged = await stagingService.createFile(operationId, 'audio');
    await staged.handle.writeFile('private staged media');
    await staged.handle.close();
    expect(path.relative(env.staticDir, operationPath).startsWith('..')).toBe(true);
    const attemptedUrl = `/static/..%2f.local%2fmedia-staging%2f${operationId}%2faudio.upload`;
    await request(app.getHttpServer()).get(attemptedUrl).expect(404);
    await stagingService.removeOperation(operationId);
    operationIds.splice(operationIds.indexOf(operationId), 1);
  });

  it('cleans staged parts after an unexpected file field and rejects over-limit covers', async () => {
    const unexpected = await request(app.getHttpServer())
      .post('/tracks')
      .field('name', 'unexpected field')
      .attach('audio', audioFixture, { filename: 'song.mp3' })
      .attach('other', pictureFixture, { filename: 'other.png' })
      .expect(400);
    expect(unexpected.body.error.code).toBe('VALIDATION_ERROR');
    await expectOwnStagingClean();

    const oversizedPicture = path.join(temporaryRoot, 'oversized.png');
    await writeFile(oversizedPicture, Buffer.alloc(1));
    await truncate(oversizedPicture, 10 * 1024 * 1024 + 1);
    const oversized = await request(app.getHttpServer())
      .post('/tracks')
      .field('name', 'oversized cover')
      .attach('audio', audioFixture, { filename: 'song.mp3' })
      .attach('picture', oversizedPicture, { filename: 'large.png' })
      .expect(413);
    expect(oversized.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    await expectOwnStagingClean();
  }, 30_000);

  it('tombstones tracks idempotently, removes comments and preserves media shared with an active track', async () => {
    const audioKey = `${randomUUID()}.mp3`;
    const pictureKey = `${randomUUID()}.png`;
    const firstTrackId = new Types.ObjectId();
    const secondTrackId = new Types.ObjectId();
    const commentId = new Types.ObjectId();
    const audioPath = path.join(env.staticDir, 'audio', audioKey);
    const picturePath = path.join(env.staticDir, 'picture', pictureKey);
    await Promise.all([
      mkdir(path.dirname(audioPath), { recursive: true }),
      mkdir(path.dirname(picturePath), { recursive: true }),
    ]);
    await Promise.all([writeFile(audioPath, 'shared audio'), writeFile(picturePath, 'shared picture')]);
    await database.collection('tracks').insertMany([
      { _id: firstTrackId, name: 'shared first', audio: audioKey, picture: pictureKey, lifecycle: 'active', comments: [commentId] },
      { _id: secondTrackId, name: 'shared second', audio: audioKey, picture: pictureKey, lifecycle: 'active', comments: [] },
    ]);
    await database.collection('comments').insertOne({ _id: commentId, track_id: firstTrackId, username: 'test', text: 'remove me' });

    try {
      const firstResponse = await request(app.getHttpServer()).delete(`/tracks/${String(firstTrackId)}`).expect(202);
      expect(firstResponse.body).toMatchObject({ _id: String(firstTrackId), status: 'accepted', operationId: expect.any(String) });
      const firstOperationId = firstResponse.body.operationId as string;
      await app.get(MaintenanceService).runOnce();

      expect(await database.collection('tracks').findOne({ _id: firstTrackId })).toMatchObject({ lifecycle: 'deleted' });
      expect(await database.collection('comments').findOne({ _id: commentId })).toBeNull();
      expect(await stat(audioPath)).toBeDefined();
      expect(await stat(picturePath)).toBeDefined();

      const repeated = await request(app.getHttpServer()).delete(`/tracks/${String(firstTrackId)}`).expect(202);
      expect(repeated.body.operationId).toBe(firstOperationId);
      await request(app.getHttpServer()).get(`/tracks/${String(firstTrackId)}`).expect(404);
      const catalogue = await request(app.getHttpServer()).get('/tracks').query({ count: 100 }).expect(200);
      expect(catalogue.body.items.map((item: { _id: string }) => item._id)).not.toContain(String(firstTrackId));
      const search = await request(app.getHttpServer()).get('/tracks/search').query({ name: 'shared first' }).expect(200);
      expect(search.body.items).toHaveLength(0);
      await request(app.getHttpServer()).get(`/tracks/${String(firstTrackId)}/comments`).expect(404);
      await request(app.getHttpServer()).post(`/tracks/${String(firstTrackId)}/comments`).send({
        trackId: String(firstTrackId), username: 'test', text: 'must not append',
      }).expect(404);
      await request(app.getHttpServer()).post(`/tracks/${String(firstTrackId)}/listen`).expect(404);
      await request(app.getHttpServer()).delete('/tracks/507f1f77bcf86cd799439099').expect(404);

      await request(app.getHttpServer()).delete(`/tracks/${String(secondTrackId)}`).expect(202);
      await app.get(MaintenanceService).runOnce();
      expect(await database.collection('tracks').findOne({ _id: secondTrackId })).toMatchObject({ lifecycle: 'deleted' });
      await expect(stat(audioPath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(stat(picturePath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await database.collection('comments').deleteMany({ _id: commentId });
      await database.collection('tracks').deleteMany({ _id: { $in: [firstTrackId, secondTrackId] } });
      await Promise.all([rm(audioPath, { force: true }), rm(picturePath, { force: true })]);
    }
  }, 30_000);

  it('claims cleanup exactly once across workers and retries transient filesystem failures with backoff', async () => {
    const operationId = randomUUID();
    const trackId = new Types.ObjectId();
    const audioKey = `${randomUUID()}.mp3`;
    const audioPath = path.join(env.staticDir, 'audio', audioKey);
    await mkdir(path.dirname(audioPath), { recursive: true });
    await writeFile(audioPath, 'retry fixture');
    await database.collection('mediaoperations').insertOne({
      operationId,
      kind: 'upload',
      trackId,
      audioKey,
      state: 'cleanup',
      attempts: 0,
      nextAttemptAt: new Date(0),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const files = app.get(FileService);
    const removeSpy = vi.spyOn(files, 'removeFile').mockRejectedValueOnce(
      Object.assign(new Error('simulated permission error'), { code: 'EACCES' }),
    );
    const competingWorker = new MaintenanceService(
      app.get(getModelToken(Track.name)),
      app.get(getModelToken(Comment.name)),
      app.get(getModelToken(MediaOperation.name)),
      app.get(getModelToken(CacheEvent.name)),
      app.get(getConnectionToken()),
      files,
    );

    try {
      const [firstRun, competingRun] = await Promise.all([
        app.get(MaintenanceService).runOnce(1),
        competingWorker.runOnce(1),
      ]);
      expect(firstRun.claimed + competingRun.claimed).toBe(1);
      expect(firstRun.retried + competingRun.retried).toBe(1);
      const retryRecord = await database.collection('mediaoperations').findOne({ operationId });
      expect(retryRecord).toMatchObject({ state: 'cleanup', attempts: 1, lastErrorCode: 'EACCES' });
      expect(retryRecord).not.toBeNull();
      expect((retryRecord!.nextAttemptAt as Date).getTime()).toBeGreaterThan(Date.now());

      removeSpy.mockRestore();
      await database.collection('mediaoperations').updateOne({ operationId }, { $set: { nextAttemptAt: new Date(0) } });
      const [retryRun, competingRetryRun] = await Promise.all([
        app.get(MaintenanceService).runOnce(1),
        competingWorker.runOnce(1),
      ]);
      expect(retryRun.claimed + competingRetryRun.claimed).toBe(1);
      expect(retryRun.completed + competingRetryRun.completed).toBe(1);
      expect(await database.collection('mediaoperations').findOne({ operationId })).toMatchObject({ state: 'done' });
      await expect(stat(audioPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      removeSpy.mockRestore();
      await database.collection('mediaoperations').deleteOne({ operationId });
      await rm(audioPath, { force: true });
    }
  }, 30_000);

  it.skipIf(!process.env.CACHE_EVENT_URL || !process.env.CACHE_EVENT_SECRET)('retries cache-event outages and marks delivery only after receiver acknowledgement', async () => {
    const trackId = new Types.ObjectId();
    const eventId = `track.deleted:${String(trackId)}`;
    await database.collection('cacheevents').insertOne({
      eventId,
      type: 'track.deleted',
      trackId,
      state: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(0),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    nextCallbackResponse = new Response('unavailable', { status: 503 });
    const failedDelivery = await app.get(MaintenanceService).runOnce();
    expect(failedDelivery.eventsClaimed).toBeGreaterThanOrEqual(1);
    expect(failedDelivery.eventsRetried).toBeGreaterThanOrEqual(1);
    const retryRecord = await database.collection('cacheevents').findOne({ eventId });
    expect(retryRecord).toMatchObject({ state: 'pending', attempts: 1, lastErrorCode: 'CACHE_CALLBACK_503' });
    await database.collection('cacheevents').updateOne({ eventId }, { $set: { nextAttemptAt: new Date(0) } });

    const successfulDelivery = await app.get(MaintenanceService).runOnce();
    expect(successfulDelivery.eventsDelivered).toBeGreaterThanOrEqual(1);
    expect(await database.collection('cacheevents').findOne({ eventId })).toMatchObject({ state: 'delivered', attempts: 2 });
    const callback = callbackRequests.find((request) => JSON.parse(request.body).eventId === eventId);
    expect(callback?.url).toBe('http://cache-callback.invalid/api/internal/cache-events');
    expect(callback?.headers.get('x-gurach-cache-secret')).toBe(process.env.CACHE_EVENT_SECRET);
    expect(JSON.parse(callback!.body)).toEqual({ eventId, type: 'track.deleted', trackId: String(trackId) });
  });

  it('persists cleanup intent after partial publication and rolls back a transaction that fails before commit', async () => {
    vi.spyOn(mediaValidator, 'validateAudio').mockResolvedValue({ durationSeconds: 1.25, codec: 'mp3', container: 'mp3' });
    vi.spyOn(mediaValidator, 'validateCover').mockResolvedValue({ width: 8, height: 8, format: 'png', pages: 1 });
    const files = app.get(FileService);
    const publish = files.publishStagedFile.bind(files);
    const publishSpy = vi.spyOn(files, 'publishStagedFile');
    let publishCalls = 0;
    publishSpy.mockImplementation(async (...args) => {
      publishCalls += 1;
      if (publishCalls === 2) throw Object.assign(new Error('simulated disk full'), { code: 'ENOSPC' });
      return publish(...args);
    });
    await request(app.getHttpServer())
      .post('/tracks')
      .field('name', 'partial publish failure')
      .attach('picture', pictureFixture, { filename: 'cover.png' })
      .attach('audio', audioFixture, { filename: 'song.mp3' })
      .expect(500);

    const partialOperationId = operationIds.at(-1)!;
    const partial = await database.collection('mediaoperations').findOne({ operationId: partialOperationId });
    expect(partial).toMatchObject({ state: 'cleanup', lastErrorCode: 'ENOSPC' });
    expect(await database.collection('tracks').findOne({ _id: partial?.trackId })).toBeNull();
    expect(await database.collection('cacheevents').findOne({ eventId: `${partialOperationId}:activated` })).toBeNull();
    await files.removeFile(partial!.audioKey as string, FileType.AUDIO);
    publishSpy.mockRestore();

    const cacheEventModel = app.get(getModelToken(CacheEvent.name));
    const cacheEventCreate = vi.spyOn(cacheEventModel, 'create').mockRejectedValueOnce(
      new Error('simulated failure inside Mongo transaction'),
    );
    await request(app.getHttpServer())
      .post('/tracks')
      .field('name', 'transaction startup failure')
      .attach('picture', pictureFixture, { filename: 'cover.png' })
      .attach('audio', audioFixture, { filename: 'song.mp3' })
      .expect(500);
    cacheEventCreate.mockRestore();

    const transactionOperationId = operationIds.at(-1)!;
    const pendingCleanup = await database.collection('mediaoperations').findOne({ operationId: transactionOperationId });
    expect(pendingCleanup).toMatchObject({ state: 'cleanup' });
    expect(await database.collection('tracks').findOne({ _id: pendingCleanup?.trackId })).toBeNull();
    expect(await database.collection('cacheevents').findOne({ eventId: `${transactionOperationId}:activated` })).toBeNull();
    await files.removeFile(pendingCleanup!.audioKey as string, FileType.AUDIO);
    await files.removeFile(pendingCleanup!.pictureKey as string, FileType.PICTURE);
    await expectOwnStagingClean();
  }, 30_000);

  it('rejects multipart field size overflow and releases the pre-body admission slot', async () => {
    const oversizedField = await request(app.getHttpServer())
      .post('/tracks')
      .field('text', 'x'.repeat(100_001))
      .expect(400);
    expect(oversizedField.body.error.code).toBe('VALIDATION_ERROR');
    await expectOwnStagingClean();

    const admission = app.get(UploadAdmissionService);
    const first = admission.reserve()!;
    const second = admission.reserve()!;
    try {
      await request(app.getHttpServer())
        .post('/tracks')
        .set('Content-Type', 'multipart/form-data; boundary=not-sent')
        .set('Content-Length', '100000000')
        .expect(429);
    } finally {
      first.release();
      second.release();
    }
    expect(admission.activeCount).toBe(0);
    await expectOwnStagingClean();
  }, 30_000);
});
