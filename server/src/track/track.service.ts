import { PermissionService } from '../auth/permission.service.js';
import type { Actor } from '../auth/session.service.js';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { FileService, FileType } from '../file/file.service.js';
import { MediaValidatorService } from '../file/media-validator.service.js';
import {
  decodeCursor,
  decodeScopedCursor,
  encodeCursor,
  encodeScopedCursor,
} from '../common/cursor.js';
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
  ) {}

  async create(
    dto: CreateTrackDto,
    picture: Express.Multer.File,
    audio: Express.Multer.File,
    operationId: string,
    actor?: Actor,
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

    const trackId = new Types.ObjectId();
    let intentCreated = false;
    let committed = false;
    let leaseToken: string | undefined;

    try {
      const [audioValidation, coverValidation] = await Promise.allSettled([
        this.mediaValidator.validateAudio(audio.path, audio.originalname),
        this.mediaValidator.validateCover(picture.path, picture.originalname),
      ]);
      if (audioValidation.status === 'rejected') throw audioValidation.reason;
      if (coverValidation.status === 'rejected') throw coverValidation.reason;
      const audioMetadata = audioValidation.value;
      const coverMetadata = coverValidation.value;
      const audioFile = this.fileService.allocateFile(FileType.AUDIO, audio.originalname);
      const pictureFile = this.fileService.allocateFile(FileType.PICTURE, picture.originalname);
      const validatedMetadata = {
        audioDurationSeconds: audioMetadata.durationSeconds,
        audioSizeBytes: audio.size,
        audioMimeType: audioFile.mimeType,
        audioCodec: audioMetadata.codec,
        audioContainer: audioMetadata.container,
        pictureSizeBytes: picture.size,
        pictureMimeType: pictureFile.mimeType,
        pictureWidth: coverMetadata.width,
        pictureHeight: coverMetadata.height,
        pictureFormat: coverMetadata.format,
        picturePages: coverMetadata.pages,
      };

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

      await this.fileService.publishStagedFile(FileType.AUDIO, audio.path, audio.originalname, audioFile.name);
      await this.fileService.publishStagedFile(FileType.PICTURE, picture.path, picture.originalname, pictureFile.name);

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
            text: dto.text,
            duration: audioMetadata.durationSeconds,
            listens: 0,
            audio: audioFile.name,
            picture: pictureFile.name,
            lifecycle: 'active',
          });
          await track.save({ session });

          const completed = await this.operationModel.updateOne(
            { operationId, trackId, state: 'publishing', leaseToken },
            {
              $set: { state: 'done', nextAttemptAt: new Date() },
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
      if (intentCreated && !committed) await this.markUploadForCleanup(operationId, leaseToken, error);
      throw error;
    }
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

  async deleteOne(id: string, actor?: Actor): Promise<DeletionAccepted> {
    const identity = new PermissionService().requireActor(actor);
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
    const { query: term, name, artist, text } = query;
    const scope = searchCursorScope({ query: term, name, artist, text });
    const cursor = query.cursor ? decodeScopedCursor(query.cursor) : undefined;
    if (cursor && cursor.scope !== scope) {
      throw new BadRequestException('"cursor" does not match the search filters');
    }

    const filter: Record<string, unknown> = { lifecycle: 'active' };

    if (term) {
      const re = new RegExp(escapeRegex(term), 'i');
      filter.$or = [{ name: re }, { artist: re }, { text: re }];
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
