import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import type { Db } from 'mongodb';
import { mkdir, mkdtemp, readdir, rm, stat, truncate, writeFile, readFile } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
import { MusicBrainzProvider } from '../src/metadata/musicbrainz.provider.js';
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
      if (typeof init?.body === 'string') callbackRequests.push({
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
    await promisify(execFile)(env.ffmpegPath, ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.25', '-c:a', 'libmp3lame', audioFixture], { timeout: 10_000 });
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
    await app.get<Model<Track>>(getModelToken(Track.name)).createIndexes();
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

    expect(response.body).toMatchObject({ name: 'Valid title', artist: 'Valid artist', lyrics: '  first line\n second line  ', duration: 1.25, album: null, genres: [] });
    expect(response.body).not.toHaveProperty('provenance');
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

  it('requires a session for metadata, rejects unexpected fields and shares the MusicBrainz slot across instances', async () => {
    const notSignedIn = rawRequest(app.getHttpServer());
    const id = '10000000-0000-4000-8000-000000000001';
    await notSignedIn.post('/metadata/search').send({ name: 'Track' }).expect(401);
    await notSignedIn.post('/metadata/details').send({ recordingMbid: id }).expect(401);
    await notSignedIn.get(`/metadata/artwork/${id}`).expect(401);
    const authorized = request(app.getHttpServer());
    await authorized.post('/metadata/search').send({ name: 'Track', unexpected: true }).expect(400);
    await authorized.post('/metadata/search').send({ name: 'x'.repeat(201) }).expect(400);
    await authorized.post('/metadata/search').send({ name: 'Track', durationMs: '1000' }).expect(400);
    await authorized.post('/metadata/details').send({ recordingMbid: 'bad' }).expect(400);
    await authorized.get('/metadata/artwork/not-a-uuid').expect(400);

    const first = app.get(MusicBrainzProvider);
    const second = new MusicBrainzProvider(app.get(getConnectionToken()));
    const fetch = vi.mocked(globalThis.fetch);
    const starts: number[] = [];
    for (let i = 0; i < 2; i++) fetch.mockImplementationOnce(async () => {
      starts.push(performance.now());
      return Response.json({ recordings: [] });
    });
    const signal = new AbortController().signal;
    await Promise.all([first.get('recording', { query: 'first' }, signal), second.get('recording', { query: 'second' }, signal)]);
    expect(starts).toHaveLength(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);

    for (const status of [429, 503]) {
      fetch.mockResolvedValueOnce(new Response(null, { status, headers: { 'Retry-After': '2' } }));
      await expect(first.get('recording', { query: 'limited' }, signal)).rejects.toThrow('throttled');
      const slot = await database.collection('metadata_provider_slots').findOne({});
      expect(slot!.next.getTime() - Date.now()).toBeGreaterThan(1500);
    }
  }, 15_000);

  it('publishes a catalog snapshot through direct and durable upload, with safe owner edits', async () => {
    const server = app.getHttpServer();
    const ownerId = new Types.ObjectId();
    const token = randomBytes(32).toString('base64url');
    await database.collection('users').insertOne({ _id: ownerId, username: `owner_${ownerId}`, displayName: 'Owner', role: 'user',
      disabled: false, quotaReady: true, quotaEntries: [] });
    await database.collection('sessions').insertOne({ userId: ownerId, tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 600_000), revokedAt: null });
    const owner = () => rawRequest.agent(server).set('Authorization', `Bearer ${token}`);
    const releaseMbid = '20000000-0000-4000-8000-000000000001';
    const recordingMbid = '10000000-0000-4000-8000-000000000001';
    const bytes = await readFile(pictureFixture);
    nextCallbackResponse = new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/png' } });
    const artwork = await owner().get(`/metadata/artwork/${releaseMbid}`).expect(200);
    expect(artwork.body).toEqual(bytes);
    const genreEvidence = [{ genre: 'Ambient', rawTag: 'ambient', source: 'musicbrainz', scope: 'recording', confidence: 0.9 }];
    const catalog = { album: 'Found release', genres: ['Ambient', 'Custom'], externalIds: { recordingMbid, releaseMbid },
      albumSource: 'musicbrainz', pictureSource: 'cover-art-archive', genreEvidence };
    const upload = (url: string, name: string, metadata?: string) => {
      const form = owner().post(url).field('name', name).field('artist', 'Catalog Artist');
      if (metadata !== undefined) form.field('catalogMetadata', metadata);
      return form.attach('audio', audioFixture).attach('picture', artwork.body, { filename: 'archive.png', contentType: 'image/png' });
    };
    await upload('/tracks', 'Invalid catalog', '{"unknown":true}').expect(400);
    await upload('/tracks', 'Invalid catalog', JSON.stringify({ album: 'ю'.repeat(8200) })).expect(400);

    const created = await upload('/tracks', 'Catalog direct', JSON.stringify(catalog)).expect(201);
    const id = created.body._id as string;
    createdTrackIds.push(id);
    expect(created.body).toMatchObject({ album: catalog.album, genres: catalog.genres, externalIds: catalog.externalIds,
      provenance: { albumSource: 'musicbrainz', pictureSource: 'cover-art-archive', genreEvidence, manualGenres: ['Custom'] } });
    await upload('/tracks', 'Catalog direct', JSON.stringify(catalog)).expect(409);
    await rawRequest(server).patch(`/tracks/${id}`).send({ album: 'Unowned' }).expect(401);
    const otherId = new Types.ObjectId();
    const otherToken = randomBytes(32).toString('base64url');
    await database.collection('users').insertOne({ _id: otherId, username: `other_${otherId}`, displayName: 'Other', role: 'user', disabled: false });
    await database.collection('sessions').insertOne({ userId: otherId, tokenHash: createHash('sha256').update(otherToken).digest('hex'),
      expiresAt: new Date(Date.now() + 600_000), revokedAt: null });
    await rawRequest(server).patch(`/tracks/${id}`).set('Authorization', `Bearer ${otherToken}`).send({ album: 'Unowned' }).expect(403);
    const same = await owner().patch(`/tracks/${id}`).send({ album: catalog.album }).expect(200);
    expect(same.body.provenance).toEqual(created.body.provenance);
    const albumEdit = await owner().patch(`/tracks/${id}`).send({ album: '' }).expect(200);
    expect(albumEdit.body).toMatchObject({ album: null, genres: catalog.genres, externalIds: { recordingMbid }, provenance: { albumSource: 'manual' } });
    expect(albumEdit.body.externalIds).not.toHaveProperty('releaseMbid');
    const genresEdit = await owner().patch(`/tracks/${id}`).send({ genres: ['Custom'] }).expect(200);
    expect(genresEdit.body).toMatchObject({ album: null, genres: ['Custom'], provenance: { genreEvidence: [], manualGenres: ['Custom'] } });
    const renamed = await owner().patch(`/tracks/${id}`).send({ name: 'Renamed' }).expect(200);
    expect(renamed.body).not.toHaveProperty('externalIds');
    await trackService.deleteOne(id, fixtureActor);
    await app.get(MaintenanceService).runOnce();

    for (const metadata of [JSON.stringify(catalog), undefined]) {
      const accepted = await upload('/tracks/uploads', metadata ? 'Catalog queued' : 'Legacy queued', metadata).expect(202);
      const { operationId, trackId } = accepted.body;
      expect((await owner().get(`/tracks/uploads/${operationId}`).expect(200)).body.status).toBe('queued');
      const operation = await database.collection('mediaoperations').findOne({ operationId });
      expect(operation?.upload?.catalogMetadata ?? undefined).toEqual(metadata ? catalog : undefined);
      await app.get(MaintenanceService).runOnce();
      expect((await owner().get(`/tracks/uploads/${operationId}`).expect(200)).body.status).toBe('published');
      const detail = (await owner().get(`/tracks/${trackId}`).expect(200)).body;
      createdTrackIds.push(trackId);
      expect(detail).toMatchObject({ album: metadata ? catalog.album : null, genres: metadata ? catalog.genres : [] });
      expect((await owner().get(new URL(detail.picture).pathname).expect(200)).body).toEqual(bytes);
      await trackService.deleteOne(trackId, fixtureActor);
      await app.get(MaintenanceService).runOnce();
    }
  }, 35_000);

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
