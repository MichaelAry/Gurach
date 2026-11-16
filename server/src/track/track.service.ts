import { commitAccountQuota } from '../file/account-quota.js';
import { PermissionService } from '../auth/permission.service.js';
import type { Actor } from '../auth/session.service.js';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { StagingService } from '../file/staging.service.js';
import { UploadJobStatus } from '../contracts/track.contract.js';
import { FileService, FileType } from '../file/file.service.js';
import { MediaValidatorService } from '../file/media-validator.service.js';
import { AudioFingerprintService, similarAudio, type AudioFingerprints } from '../file/audio-fingerprint.service.js';
import {
  decodeCursor,
  decodeScopedCursor,
  encodeCursor,
  encodeScopedCursor,
} from '../common/cursor.js';
import { UpdateTrackDto } from './dto/update-track.dto.js';
import { CreateTrackDto } from './dto/create-track.dto.js';
import {
  DeletionAccepted,
  ListenResult,
  TrackDetail,
  TrackListPage,
  TrackSearchPage,
} from '../contracts/track.contract.js';
import type { ListTracksQuery } from './dto/list-tracks-query.dto.js';
import { searchCursorScope, type SearchTracksQuery } from './dto/search-tracks-query.dto.js';
import { toTrackDetail, toTrackListItem, type TrackListRecord } from './mappers/track.mapper.js';
import { normalizeTrackIdentity } from './track-identity.js';
import { DuplicateTrackError } from './duplicate-track.error.js';
import { AUDIO_EXACT_INDEXES, isAudioExactIndex, isTrackIdentityIndex, TRACK_IDENTITY_INDEX } from './schemas/track.schema.js';
import { Track, TrackDocument } from './schemas/track.schema.js';
import { CacheEvent, CacheEventDocument } from '../maintenance/schemas/cache-event.schema.js';
import { MediaOperation, MediaOperationDocument } from '../maintenance/schemas/media-operation.schema.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class TrackService {
  private readonly logger = new Logger(TrackService.name);
  constructor(
    @InjectModel(Track.name) private trackModel: Model<TrackDocument>,
    @InjectModel(MediaOperation.name) private operationModel: Model<MediaOperationDocument>,
    @InjectModel(CacheEvent.name) private cacheEventModel: Model<CacheEventDocument>,
    @InjectConnection() private connection: Connection,
    private fileService: FileService,
    private mediaValidator: MediaValidatorService,
    private fingerprints: AudioFingerprintService = new AudioFingerprintService(),
  ) {}

  async enqueue(dto: CreateTrackDto, picture: Express.Multer.File, audio: Express.Multer.File,
    operationId: string, actor: Actor): Promise<UploadJobStatus> {
    new PermissionService().requireActor(actor);
    if (!audio || !picture) throw new BadRequestException('picture and audio are required');
    // Persist file contents before acknowledging the durable database intent.
    for (const file of [audio, picture]) {
      const handle = await open(file.path, 'r');
      try { await handle.sync(); } finally { await handle.close(); }
    }
    const directory = await open(path.dirname(audio.path), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    const operation = await this.operationModel.create({
      operationId, kind: 'upload', trackId: new Types.ObjectId(), ownerId: new Types.ObjectId(actor.id),
      stageDirectory: operationId, state: 'queued', attempts: 0, nextAttemptAt: new Date(),
      audioKey: this.fileService.allocateFile(FileType.AUDIO, 'compatible.mp3').name,
      pictureKey: this.fileService.allocateFile(FileType.PICTURE, picture.originalname).name,
      upload: { name: dto.name, artist: dto.artist, text: dto.text, audioName: audio.originalname,
        pictureName: picture.originalname, audioSize: audio.size, pictureSize: picture.size },
    });
    return Object.assign(new UploadJobStatus(), { operationId, trackId: String(operation.trackId), status: 'queued' });
  }

  async uploadStatus(operationId: string, actor: Actor): Promise<UploadJobStatus> {
    const operation = await this.operationModel.findOne({ operationId, kind: 'upload', ownerId: new Types.ObjectId(actor.id),
      upload: { $exists: true } }).lean().exec();
    if (!operation) throw new NotFoundException('Upload job not found');
    return Object.assign(new UploadJobStatus(), { operationId, trackId: String(operation.trackId),
      status: operation.result === 'published' ? 'published' : operation.result === 'failed' ? 'failed'
        : operation.state === 'queued' ? 'queued' : 'processing',
      ...(operation.lastErrorCode ? { errorCode: operation.lastErrorCode } : {}),
      ...(operation.existingTrackId ? { existingTrackId: operation.existingTrackId } : {}),
      ...(operation.duplicateReason ? { duplicateReason: operation.duplicateReason } : {}),
    });
  }

  async processUpload(operation: MediaOperation, staging: StagingService): Promise<void> {
    if (!operation.upload || !operation.ownerId || !operation.leaseToken) throw new Error('Invalid durable upload');
    await staging.removeDerivedFiles(operation.operationId);
    const upload = operation.upload;
    const directory = staging.resolveOperationPath(operation.operationId);
    const output = path.join(directory, `${operation.leaseToken}.mp3`);
    const audio = { path: path.join(directory, 'audio.upload'), originalname: upload.audioName, size: upload.audioSize } as Express.Multer.File;
    const picture = { path: path.join(directory, 'picture.upload'), originalname: upload.pictureName, size: upload.pictureSize } as Express.Multer.File;
    try {
      await this.create({ name: upload.name, artist: upload.artist, text: upload.text } as CreateTrackDto,
        picture, audio, operation.operationId,
        { id: String(operation.ownerId), role: 'user', username: '', displayName: '' }, { operation, output });
    } finally { await rm(output, { force: true }); }
  }

  async create(
    dto: CreateTrackDto,
    picture: Express.Multer.File,
    audio: Express.Multer.File,
    operationId: string,
    actor?: Actor,
    job?: { operation: MediaOperation; output: string },
  ): Promise<TrackDetail> {
    const identity = new PermissionService().requireActor(actor);
    if (!audio) {
      throw new BadRequestException('Audio file is required');
    }
    if (!picture) {
      throw new BadRequestException('Picture file is required');
    }
    if (!operationId || !/^[a-f0-9-]{36}$/i.test(operationId)) {
      throw new BadRequestException('Upload operation identity is missing or invalid');
    }

    const trackId = job?.operation.trackId ?? new Types.ObjectId();
    let intentCreated = false;
    let committed = false;
    let leaseToken: string | undefined = job?.operation.leaseToken;
    let audioPrints: AudioFingerprints | undefined;

    const nameKey = normalizeTrackIdentity(dto.name);
    const artistKey = normalizeTrackIdentity(dto.artist);
    try {
      const indexes = await this.trackModel.collection.listIndexes().toArray().catch((error: unknown) => {
        if (error instanceof mongoose.mongo.MongoServerError && error.code === 26) return [];
        throw error;
      });
      if (!indexes.some(isTrackIdentityIndex)) {
        throw new ServiceUnavailableException('Track identity index is missing; run migration 008-track-identity');
      }
      if (!AUDIO_EXACT_INDEXES.every((definition) => indexes.some((index) => isAudioExactIndex(index, definition)))) {
        throw new ServiceUnavailableException('Audio fingerprint indexes are missing; run migration 009-audio-fingerprint-indexes');
      }
      const existing = await this.findDuplicate(nameKey, artistKey);
      if (existing) throw new DuplicateTrackError(existing);
      const [audioValidation, coverValidation] = await Promise.allSettled([
        this.mediaValidator.validateAudio(audio.path, audio.originalname),
        this.mediaValidator.validateCover(picture.path, picture.originalname),
      ]);
      if (audioValidation.status === 'rejected') throw audioValidation.reason;
      if (coverValidation.status === 'rejected') throw coverValidation.reason;
      const audioMetadata = audioValidation.value;
      const coverMetadata = coverValidation.value;
      // Still private: no allocated or public file exists when preflight rejects.
      audioPrints = await this.fingerprints.compute(audio.path);
      await this.assertNoAudioDuplicate(audioPrints);
      const compatiblePath = job?.output ?? path.join(path.dirname(audio.path), `${operationId}.mp3`);
      if (audioMetadata.durationSeconds > 3600) throw new BadRequestException('Audio duration exceeds one hour');
      await this.mediaValidator.createCompatibleAudio(audio.path, compatiblePath);
      const compatibleMetadata = await this.mediaValidator.validateAudio(compatiblePath, 'compatible.mp3');
      if (Math.abs(compatibleMetadata.durationSeconds - audioMetadata.durationSeconds) > 2) {
        throw new BadRequestException('Compatible audio was truncated');
      }
      const compatibleSize = (await stat(compatiblePath)).size;
      await this.assertNoAudioDuplicate(audioPrints);
      await this.assertNoAudioDuplicate(await this.fingerprints.compute(compatiblePath));
      const audioFile = this.fileService.allocateFile(FileType.AUDIO, 'compatible.mp3');
      if (job) audioFile.name = job.operation.audioKey!;
      const pictureFile = this.fileService.allocateFile(FileType.PICTURE, picture.originalname);
      if (job) pictureFile.name = job.operation.pictureKey!;
      const validatedMetadata = {
        audioDurationSeconds: audioMetadata.durationSeconds,
        audioSizeBytes: compatibleSize,
        audioMimeType: audioFile.mimeType,
        audioCodec: compatibleMetadata.codec,
        audioContainer: compatibleMetadata.container,
        pictureSizeBytes: picture.size,
        pictureMimeType: pictureFile.mimeType,
        pictureWidth: coverMetadata.width,
        pictureHeight: coverMetadata.height,
        pictureFormat: coverMetadata.format,
        picturePages: coverMetadata.pages,
      };

      if (!job) {
        await this.operationModel.create({
          operationId,
          kind: 'upload',
          trackId,
          audioKey: audioFile.name,
          pictureKey: pictureFile.name,
          stageDirectory: operationId,
          metadata: validatedMetadata,
          ownerId: new Types.ObjectId(identity.id),
          state: 'uploading',
          attempts: 0,
          nextAttemptAt: new Date(),
        });
        intentCreated = true;

        leaseToken = randomUUID();
        const leased = await this.operationModel.updateOne(
          { operationId, trackId, state: 'uploading' },
          {
            $set: {
              state: 'publishing',
              leaseOwner: `http:${operationId}`,
              leaseToken,
              leaseUntil: new Date(Date.now() + 30_000),
            },
          },
        ).exec();
        if (leased.matchedCount !== 1) throw new Error('Upload operation could not acquire its publication lease');

      }
      if (job) {
        const owned = await this.operationModel.exists({ operationId, state: 'processing', leaseToken, leaseUntil: { $gt: new Date() } }).exec();
        if (!owned) throw new Error('Upload lease lost');
      }
      await this.fileService.publishStagedFile(FileType.AUDIO, compatiblePath, 'compatible.mp3', audioFile.name, Boolean(job));
      await this.fileService.publishStagedFile(FileType.PICTURE, picture.path, picture.originalname, pictureFile.name, Boolean(job));
      if (job) await rm(job.output, { force: true });

      let createdTrack: TrackDocument | undefined;
      const session = await this.connection.startSession();
      try {
        await session.withTransaction(async () => {
          const track = new this.trackModel({
            _id: trackId,
            ownerId: new Types.ObjectId(identity.id),
            // Map explicitly so DTO fields cannot bypass the file layer.
            name: dto.name,
            artist: dto.artist,
            nameKey,
            artistKey,
            ...audioPrints,
            text: dto.text,
            duration: audioMetadata.durationSeconds,
            listens: 0,
            audio: audioFile.name,
            picture: pictureFile.name,
            lifecycle: 'active',
            publishedAt: new Date(),
          });
          await commitAccountQuota(this.connection, identity.id, operationId, trackId, compatibleSize + picture.size + (job ? audio.size + picture.size : 0), session);
          await track.save({ session });

          const completed = await this.operationModel.updateOne(
            { operationId, trackId, state: job ? 'processing' : 'publishing', leaseToken, ...(job ? { leaseUntil: { $gt: new Date() } } : {}) },
            {
              $set: { state: 'done', ...(job ? { result: 'published', metadata: validatedMetadata } : {}), nextAttemptAt: new Date() },
              $unset: { leaseOwner: '', leaseToken: '', leaseUntil: '' },
            },
            { session },
          ).exec();
          if (completed.matchedCount !== 1) {
            throw new Error('Upload publication lease was lost before transaction commit');
          }

          await this.cacheEventModel.create([{
            eventId: `${operationId}:activated`,
            type: 'track.activated',
            trackId,
            state: 'pending',
            attempts: 0,
            nextAttemptAt: new Date(),
          }], { session });
          createdTrack = track;
        });
      } finally {
        await session.endSession();
      }
      if (!createdTrack) throw new Error('Upload transaction committed without returning its track');
      committed = true;
      return toTrackDetail(createdTrack);
    } catch (error) {
      if (!job && intentCreated && !committed) await this.markUploadForCleanup(operationId, leaseToken, error);
      // Cleanup must happen before looking up the winner of a publication race.
      if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000
        && error.message.includes(`index: ${TRACK_IDENTITY_INDEX} dup key`)) {
        const existing = await this.findDuplicate(nameKey, artistKey).catch(() => undefined);
        throw new DuplicateTrackError(existing);
      }
      if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000 && audioPrints) {
        const definition = AUDIO_EXACT_INDEXES.find(({ name }) => error.message.includes(`index: ${name} dup key`));
        if (definition) {
          const existing = await this.trackModel.findOne({ lifecycle: 'active', [definition.field]: audioPrints[definition.field] })
            .select('_id').lean().exec().catch(() => null);
          throw new DuplicateTrackError(existing ? String(existing._id) : undefined,
            definition.field === 'fileSha256' ? 'file_sha256' : 'decoded_audio_sha256');
        }
      }
      throw error;
    }
  }

  private async assertNoAudioDuplicate(prints: AudioFingerprints): Promise<void> {
    for (const { field } of AUDIO_EXACT_INDEXES) {
      const existing = await this.trackModel.findOne({ lifecycle: 'active', [field]: prints[field] }).select('_id').lean().exec();
      if (existing) throw new DuplicateTrackError(String(existing._id), field === 'fileSha256' ? 'file_sha256' : 'decoded_audio_sha256');
    }
    const duration = prints.audioFingerprint.duration;
    const candidates = this.trackModel.find({ lifecycle: 'active',
      'audioFingerprint.duration': { $gte: duration - 2, $lte: duration + 2 },
    }).select('_id audioFingerprint').lean().cursor();
    try {
      for await (const candidate of candidates) {
        if (candidate.audioFingerprint && similarAudio(prints.audioFingerprint, candidate.audioFingerprint)) {
          throw new DuplicateTrackError(String(candidate._id), 'chromaprint');
        }
      }
    } finally { await candidates.close(); }
  }

  private async findDuplicate(nameKey: string, artistKey: string, excludeId?: Types.ObjectId): Promise<string | undefined> {
    const exclusion = excludeId ? { _id: { $ne: excludeId } } : {};
    const keyed = await this.trackModel.findOne({ lifecycle: 'active', nameKey, artistKey, ...exclusion }).select('_id').lean().exec();
    if (keyed) return String(keyed._id);
    // A partial index alone cannot protect a legacy catalogue. Check all unkeyed
    // active rows with the same JS normalizer until the complete backfill passes.
    const legacy = this.trackModel.find({
      lifecycle: 'active',
      ...exclusion,
      $or: [{ nameKey: { $not: { $type: 'string' } } }, { artistKey: { $not: { $type: 'string' } } }],
    }).select('_id name artist').lean().cursor();
    for await (const track of legacy) {
      if (normalizeTrackIdentity(track.name) === nameKey && normalizeTrackIdentity(track.artist) === artistKey) {
        await legacy.close();
        return String(track._id);
      }
    }
    return undefined;
  }

  private async markUploadForCleanup(operationId: string, leaseToken: string | undefined, error: unknown): Promise<void> {
    const errorObject = error as { code?: unknown; name?: unknown };
    const rawCode = typeof errorObject?.code === 'string'
      ? errorObject.code
      : typeof errorObject?.name === 'string' ? errorObject.name : 'unknown';
    const lastErrorCode = /^[A-Za-z0-9_-]{1,64}$/.test(rawCode) ? rawCode : 'upload_failed';
    const filter: Record<string, unknown> = leaseToken
      ? {
          $or: [
            { operationId, state: 'uploading' },
            { operationId, state: 'publishing', leaseToken },
          ],
        }
      : { operationId, state: { $in: ['uploading', 'publishing'] } };
    try {
      await this.operationModel.updateOne(filter, {
        $set: { state: 'cleanup', nextAttemptAt: new Date(), lastErrorCode },
        $inc: { attempts: 1 },
        $unset: { leaseOwner: '', leaseToken: '', leaseUntil: '' },
      }).exec();
    } catch (cleanupError) {
      this.logger.error(`Could not mark upload operation ${operationId} for cleanup (${this.safeErrorCode(cleanupError)})`);
    }
  }

  private safeErrorCode(error: unknown): string {
    const value = error as { code?: unknown; name?: unknown };
    const code = typeof value?.code === 'string' ? value.code : typeof value?.name === 'string' ? value.name : 'unknown';
    return /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : 'unknown';
  }

  async getPage(query: ListTracksQuery): Promise<TrackListPage> {
    const after = query.cursor ? decodeCursor(query.cursor).after : undefined;
    const filter: Record<string, unknown> = { lifecycle: 'active' };
    if (after) filter._id = { $gt: new Types.ObjectId(after) };
    const records = (await this.trackModel
      .find(filter)
      .select('_id name artist audio picture duration listens')
      .sort({ _id: 1 })
      .limit(query.count + 1)
      .lean()
      .exec()) as TrackListRecord[];

    const hasMore = records.length > query.count;
    const pageRecords = records.slice(0, query.count);
    return Object.assign(new TrackListPage(), {
      items: pageRecords.map(toTrackListItem),
      nextCursor:
        hasMore && pageRecords.length > 0
          ? encodeCursor({ after: String(pageRecords.at(-1)!._id) })
          : null,
    });
  }

  async getOne(id: string): Promise<TrackDetail> {
    this.assertValidId(id);

    const track = (await this.trackModel
      .findOne({ _id: new Types.ObjectId(id), lifecycle: 'active' })
      .select('_id name artist audio picture duration listens text ownerId')
      .lean()
      .exec()) as TrackListRecord | null;

    if (!track) {
      throw new NotFoundException(`Track with id "${id}" was not found`);
    }

    return toTrackDetail(track);
  }

  async update(id: string, dto: UpdateTrackDto, actor?: Actor): Promise<TrackDetail> {
    const permissions = new PermissionService();
    const identity = permissions.requireActor(actor);
    this.assertValidId(id);
    if (dto.name === undefined && dto.artist === undefined && dto.text === undefined) {
      throw new BadRequestException('Provide at least one of: name, artist, text');
    }
    const trackId = new Types.ObjectId(id);
    const eventId = `${randomUUID()}:updated`;
    let nameKey = '';
    let artistKey = '';
    let result: TrackDetail | undefined;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await this.trackModel.findOne({ _id: trackId, lifecycle: 'active' }).session(session).lean().exec();
        if (!current) throw new NotFoundException(`Track with id "${id}" was not found`);
        permissions.assertOwner(identity, current.ownerId);

        const indexes = await this.trackModel.collection.listIndexes().toArray();
        if (!indexes.some(isTrackIdentityIndex)) {
          throw new ServiceUnavailableException('Track identity index is missing; run migration 008-track-identity');
        }
        nameKey = normalizeTrackIdentity(dto.name ?? current.name);
        artistKey = normalizeTrackIdentity(dto.artist ?? current.artist);
        const duplicate = await this.findDuplicate(nameKey, artistKey, trackId);
        if (duplicate) throw new DuplicateTrackError(duplicate);

        // An explicit $set keeps media, fingerprints, ownership and counters untouched.
        // The transaction retries against fresh metadata after concurrent edits/deletion.
        const updated = await this.trackModel.findOneAndUpdate(
          { _id: trackId, lifecycle: 'active', ...(identity.role === 'admin' ? {} : { ownerId: new Types.ObjectId(identity.id) }) },
          { $set: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.artist !== undefined ? { artist: dto.artist } : {}),
            ...(dto.text !== undefined ? { text: dto.text } : {}),
            nameKey,
            artistKey,
          } },
          { session, returnDocument: 'after', runValidators: true },
        ).select('_id name artist audio picture duration listens text ownerId').lean().exec();
        if (!updated) throw new NotFoundException(`Track with id "${id}" was not found`);
        await this.cacheEventModel.create([{
          eventId,
          type: 'track.updated',
          trackId,
          state: 'pending',
          attempts: 0,
          nextAttemptAt: new Date(),
        }], { session });
        result = toTrackDetail(updated);
      });
    } catch (error) {
      if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000
        && error.message.includes(`index: ${TRACK_IDENTITY_INDEX} dup key`)) {
        const existing = await this.findDuplicate(nameKey, artistKey, trackId).catch(() => undefined);
        throw new DuplicateTrackError(existing);
      }
      throw error;
    } finally {
      await session.endSession();
    }
    if (!result) throw new Error('Update transaction committed without returning its track');
    return result;
  }

  async reports(actor: Actor) {
    if (actor.role !== 'admin') throw new ForbiddenException('Moderator access required');
    return this.connection.collection('trackreports').find({ state: 'open' }).sort({ _id: -1 }).limit(100).toArray();
  }

  async report(id: string, reason: string, actor: Actor): Promise<void> {
    this.assertValidId(id);
    if (!reason.trim()) throw new BadRequestException('A report reason is required');
    if (!await this.trackModel.exists({ _id: id, lifecycle: 'active' })) throw new NotFoundException('Track not found');
    const indexes = await this.connection.collection('trackreports').listIndexes().toArray().catch(() => []);
    if (!indexes.some((index) => index.name === 'track_report_actor_unique' && index.unique)) throw new ServiceUnavailableException('Run migration 012-controlled-registration');
    try {
      await this.connection.collection('trackreports').updateOne({ trackId: new Types.ObjectId(id), reporterId: new Types.ObjectId(actor.id) },
        { $setOnInsert: { reason: reason.trim(), createdAt: new Date(), state: 'open' } }, { upsert: true });
    } catch (error) {
      if (!(error instanceof mongoose.mongo.MongoServerError && error.code === 11000
        && error.message.includes('track_report_actor_unique'))) throw error;
    }
  }

  async unpublish(id: string, reason: string, actor: Actor): Promise<DeletionAccepted> {
    if (actor.role !== 'admin') throw new ForbiddenException('Moderator access required');
    if (!reason.trim()) throw new BadRequestException('A moderation reason is required');
    return this.deleteOne(id, actor, reason.trim());
  }

  async deleteOne(id: string, actor?: Actor, moderationReason?: string): Promise<DeletionAccepted> {
    const identity = new PermissionService().requireActor(actor);
    if (moderationReason && identity.role !== 'admin') throw new ForbiddenException('Moderator access required');
    this.assertValidId(id);
    const trackId = new Types.ObjectId(id);
    const newOperationId = randomUUID();
    let operationId: string | undefined;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await this.trackModel.findById(trackId).session(session).lean().exec();
        if (!current) throw new NotFoundException(`Track with id "${id}" was not found`);

        new PermissionService().assertOwner(identity, current.ownerId);
        if (moderationReason) {
          await this.trackModel.updateOne({ _id: trackId }, { $set: {
            moderationRemovedAt: new Date(), moderationActorId: new Types.ObjectId(identity.id), moderationReason,
          } }, { session });
          await this.connection.collection('trackreports').updateMany({ trackId, state: 'open' },
            { $set: { state: 'removed', resolvedAt: new Date(), moderatorId: new Types.ObjectId(identity.id) } }, { session });
        }
        if (current.lifecycle !== 'active') {
          const existing = await this.operationModel.findOne({ kind: 'delete', trackId }).session(session).lean().exec();
          if (!existing) throw new Error('Track lifecycle has no matching delete operation');
          operationId = existing.operationId;
          return;
        }

        const transitioned = await this.trackModel.updateOne(
          { _id: trackId, lifecycle: 'active', ...(identity.role === 'admin' ? {} : { ownerId: new Types.ObjectId(identity.id) }) },
          { $set: { lifecycle: 'deleting' } },
          { session },
        ).exec();
        if (transitioned.matchedCount !== 1) throw new Error('Track lifecycle changed while accepting deletion');

        operationId = newOperationId;
        await this.operationModel.create([{
          operationId,
          kind: 'delete',
          trackId,
          ...(current.audio ? { audioKey: current.audio } : {}),
          ...(current.picture ? { pictureKey: current.picture } : {}),
          ownerId: current.ownerId ?? null,
          state: 'cleanup',
          attempts: 0,
          nextAttemptAt: new Date(),
        }], { session });
        await this.cacheEventModel.create([{
          eventId: `track.deleted:${id}`,
          type: 'track.deleted',
          trackId,
          state: 'pending',
          attempts: 0,
          nextAttemptAt: new Date(),
        }], { session });
      });
    } finally {
      await session.endSession();
    }
    if (!operationId) throw new Error('Delete transaction committed without returning its operation');
    return Object.assign(new DeletionAccepted(), { _id: id, operationId, status: 'accepted' as const });
  }

  async listen(id: string): Promise<ListenResult> {
    this.assertValidId(id);

    // Атомарный инкремент: без race-условий read-modify-write.
    // Документ не найден → 404, как и раньше.
    const updated = await this.trackModel
      .findOneAndUpdate({ _id: new Types.ObjectId(id), lifecycle: 'active' }, { $inc: { listens: 1 } }, { returnDocument: 'after' })
      .select('listens')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Track with id "${id}" was not found`);
    }

    return Object.assign(new ListenResult(), { listens: updated.listens });
  }

  async search(query: SearchTracksQuery): Promise<TrackSearchPage> {
    const { query: term, name, artist, text, nameOrArtist } = query;
    const scope = searchCursorScope({ query: term, name, artist, text, nameOrArtist });
    const cursor = query.cursor ? decodeScopedCursor(query.cursor) : undefined;
    if (cursor && cursor.scope !== scope) {
      throw new BadRequestException('"cursor" does not match the search filters');
    }

    const filter: Record<string, unknown> = { lifecycle: 'active' };

    if (term) {
      const re = new RegExp(escapeRegex(term), 'i');
      filter.$or = [{ name: re }, { artist: re }, { text: re }];
    }

    if (nameOrArtist) {
      const re = new RegExp(escapeRegex(nameOrArtist), 'i');
      // A separate clause preserves AND semantics with the legacy query filter.
      filter.$and = [{ $or: [{ name: re }, { artist: re }] }];
    }

    if (name) {
      filter.name = new RegExp(escapeRegex(name), 'i');
    }
    if (artist) {
      filter.artist = new RegExp(escapeRegex(artist), 'i');
    }
    if (text) {
      filter.text = new RegExp(escapeRegex(text), 'i');
    }

    if (Object.keys(filter).length === 0) {
      throw new BadRequestException(
        'Provide at least one of: query, name, artist, text',
      );
    }

    if (cursor) filter._id = { $gt: new Types.ObjectId(cursor.after) };
    const records = (await this.trackModel
      .find(filter)
      .select('_id name artist audio picture duration listens')
      .sort({ _id: 1 })
      .limit(query.count + 1)
      .lean()
      .exec()) as TrackListRecord[];
    const hasMore = records.length > query.count;
    const pageRecords = records.slice(0, query.count);
    return Object.assign(new TrackSearchPage(), {
      items: pageRecords.map(toTrackListItem),
      nextCursor: hasMore && pageRecords.length > 0
        ? encodeScopedCursor({ after: String(pageRecords.at(-1)!._id), scope })
        : null,
    });
  }

  private assertValidId(id: string, field = 'id'): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(
        `"${field}" is not a valid ObjectId: "${id}"`,
      );
    }
  }

  private rethrow(error: unknown): never {
    if (
      error instanceof mongoose.Error.ValidationError ||
      error instanceof mongoose.Error.CastError
    ) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }
}
