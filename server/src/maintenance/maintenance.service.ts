import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import type { Connection, Model } from 'mongoose';
import { FileService, FileType } from '../file/file.service.js';
import { env } from '../common/env.js';
import { CacheEvent, CacheEventDocument } from './schemas/cache-event.schema.js';
import { MediaOperation, MediaOperationDocument } from './schemas/media-operation.schema.js';
import { Comment, CommentDocument } from '../comment/schemas/comment.schema.js';
import { Track, TrackDocument } from '../track/schemas/track.schema.js';
import { deliverCacheEvent } from './cache-event-delivery.js';

const LEASE_DURATION_MS = 30_000;
const LEASE_HEARTBEAT_MS = 10_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
const DEFAULT_BATCH_SIZE = 100;

interface ClaimedOperation {
  operationId: string;
  kind: 'upload' | 'delete';
  trackId: TrackDocument['_id'];
  audioKey?: string;
  pictureKey?: string;
  leaseToken: string;
  attempts: number;
}

export interface MaintenanceRunResult {
  claimed: number;
  completed: number;
  retried: number;
  eventsClaimed: number;
  eventsDelivered: number;
  eventsRetried: number;
}

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private readonly workerId = `maintenance:${process.pid}:${randomUUID()}`;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private inFlight?: Promise<MaintenanceRunResult>;

  constructor(
    @InjectModel(Track.name) private readonly trackModel: Model<TrackDocument>,
    @InjectModel(Comment.name) private readonly commentModel: Model<CommentDocument>,
    @InjectModel(MediaOperation.name) private readonly operationModel: Model<MediaOperationDocument>,
    @InjectModel(CacheEvent.name) private readonly cacheEventModel: Model<CacheEventDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly fileService: FileService,
  ) {}

  onModuleInit(): void {
    if (!env.cacheEvents.callbackUrl || !env.cacheEvents.secret) {
      this.logger.warn('Cache-event delivery is disabled until CACHE_EVENT_URL and CACHE_EVENT_SECRET are configured');
    }
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.logger.error(`Maintenance poll failed (${this.safeErrorCode(error)})`);
      });
    }, env.maintenancePollIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.inFlight;
  }

  async runOnce(limit = DEFAULT_BATCH_SIZE): Promise<MaintenanceRunResult> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error('Maintenance batch size must be between 1 and 1000');
    }
    if (this.running) {
      return { claimed: 0, completed: 0, retried: 0, eventsClaimed: 0, eventsDelivered: 0, eventsRetried: 0 };
    }
    this.running = true;
    const inFlight = this.drain(limit);
    this.inFlight = inFlight;
    try {
      return await inFlight;
    } finally {
      this.inFlight = undefined;
      this.running = false;
    }
  }

  private async drain(limit: number): Promise<MaintenanceRunResult> {
    const result: MaintenanceRunResult = {
      claimed: 0,
      completed: 0,
      retried: 0,
      eventsClaimed: 0,
      eventsDelivered: 0,
      eventsRetried: 0,
    };
    while (result.claimed < limit) {
      const operation = await this.claimNext();
      if (!operation) break;
      result.claimed += 1;
      if (await this.process(operation)) result.completed += 1;
      else result.retried += 1;
    }
    if (env.cacheEvents.callbackUrl && env.cacheEvents.secret) {
      while (result.eventsClaimed < limit) {
        const event = await this.claimNextCacheEvent();
        if (!event) break;
        result.eventsClaimed += 1;
        if (await this.deliverClaimedEvent(event)) result.eventsDelivered += 1;
        else result.eventsRetried += 1;
      }
    }
    return result;
  }

  private async claimNext(): Promise<ClaimedOperation | null> {
    const now = new Date();
    const leaseToken = randomUUID();
    const claimed = await this.operationModel.findOneAndUpdate(
      {
        state: 'cleanup',
        nextAttemptAt: { $lte: now },
        $or: [
          { leaseUntil: { $exists: false } },
          { leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          leaseOwner: this.workerId,
          leaseToken,
          leaseUntil: new Date(now.getTime() + LEASE_DURATION_MS),
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: 'after', sort: { nextAttemptAt: 1, createdAt: 1 } },
    ).lean().exec();
    if (!claimed) return null;
    return {
      operationId: claimed.operationId,
      kind: claimed.kind,
      trackId: claimed.trackId,
      ...(claimed.audioKey ? { audioKey: claimed.audioKey } : {}),
      ...(claimed.pictureKey ? { pictureKey: claimed.pictureKey } : {}),
      leaseToken,
      attempts: claimed.attempts,
    };
  }

  private async claimNextCacheEvent(): Promise<{
    eventId: string;
    type: 'track.activated' | 'track.deleted';
    trackId: string;
    leaseToken: string;
    attempts: number;
  } | null> {
    const now = new Date();
    const leaseToken = randomUUID();
    const event = await this.cacheEventModel.findOneAndUpdate(
      {
        state: 'pending',
        nextAttemptAt: { $lte: now },
        $or: [
          { leaseUntil: { $exists: false } },
          { leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          leaseOwner: this.workerId,
          leaseToken,
          leaseUntil: new Date(now.getTime() + LEASE_DURATION_MS),
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: 'after', sort: { nextAttemptAt: 1, createdAt: 1 } },
    ).lean().exec();
    if (!event) return null;
    return {
      eventId: event.eventId,
      type: event.type,
      trackId: String(event.trackId),
      leaseToken,
      attempts: event.attempts,
    };
  }

  private async deliverClaimedEvent(event: {
    eventId: string;
    type: 'track.activated' | 'track.deleted';
    trackId: string;
    leaseToken: string;
    attempts: number;
  }): Promise<boolean> {
    const url = env.cacheEvents.callbackUrl;
    const secret = env.cacheEvents.secret;
    if (!url || !secret) return false;
    try {
      await deliverCacheEvent(url, secret, {
        eventId: event.eventId,
        type: event.type,
        trackId: event.trackId,
      });
      const delivered = await this.cacheEventModel.updateOne(
        { eventId: event.eventId, state: 'pending', leaseToken: event.leaseToken },
        {
          $set: { state: 'delivered', deliveredAt: new Date() },
          $unset: { leaseOwner: '', leaseToken: '', leaseUntil: '' },
        },
      ).exec();
      return delivered.matchedCount === 1;
    } catch (error) {
      await this.scheduleCacheEventRetry(event, error);
      this.logger.warn(`Cache event ${event.eventId} will retry (${this.safeErrorCode(error)})`);
      return false;
    }
  }

  private async scheduleCacheEventRetry(
    event: { eventId: string; leaseToken: string; attempts: number },
    error: unknown,
  ): Promise<void> {
    const delay = Math.min(5_000 * (2 ** Math.min(event.attempts - 1, 6)), MAX_RETRY_DELAY_MS);
    try {
      await this.cacheEventModel.updateOne(
        { eventId: event.eventId, state: 'pending', leaseToken: event.leaseToken },
        {
          $set: {
            nextAttemptAt: new Date(Date.now() + delay),
            lastErrorCode: this.safeErrorCode(error),
          },
          $unset: { leaseOwner: '', leaseToken: '', leaseUntil: '' },
        },
      ).exec();
    } catch (retryError) {
      this.logger.error(`Could not schedule cache-event retry ${event.eventId} (${this.safeErrorCode(retryError)})`);
    }
  }

  private async process(operation: ClaimedOperation): Promise<boolean> {
    let leaseLost = false;
    const heartbeat = setInterval(() => {
      void this.renewLease(operation).catch(() => { leaseLost = true; });
    }, LEASE_HEARTBEAT_MS);
    try {
      await this.renewLease(operation);
      if (operation.kind === 'delete') {
        await this.commentModel.deleteMany({ track_id: operation.trackId }).exec();
      }

      await this.removeIfUnreferenced(operation, operation.audioKey, FileType.AUDIO, 'audioKey');
      await this.removeIfUnreferenced(operation, operation.pictureKey, FileType.PICTURE, 'pictureKey');
      clearInterval(heartbeat);
      if (leaseLost) throw new LostMaintenanceLeaseError();
      await this.renewLease(operation);
      await this.finalize(operation);
      return true;
    } catch (error) {
      if (!(error instanceof LostMaintenanceLeaseError)) {
        await this.scheduleRetry(operation, error);
        this.logger.warn(`Maintenance operation ${operation.operationId} will retry (${this.safeErrorCode(error)})`);
      }
      return false;
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async removeIfUnreferenced(
    operation: ClaimedOperation,
    key: string | undefined,
    type: FileType,
    field: 'audioKey' | 'pictureKey',
  ): Promise<void> {
    if (!key) return;
    await this.renewLease(operation);
    // Old records can contain names outside the UUID storage policy. Leave those
    // files untouched for the explicit reconciliation workflow rather than
    // letting legacy metadata choose a filesystem path.
    try {
      this.fileService.resolveStoredPath(key, type);
    } catch (error) {
      if (error instanceof BadRequestException) {
        this.logger.warn(`Operation ${operation.operationId} has an unsafe legacy ${field}; left for reconciliation`);
        return;
      }
      throw error;
    }
    const trackField = field === 'audioKey' ? 'audio' : 'picture';
    const activeReference = await this.trackModel.exists({
      [trackField]: key,
      lifecycle: 'active',
    }).exec();
    if (activeReference) return;

    const inFlightUploadReference = await this.operationModel.exists({
      operationId: { $ne: operation.operationId },
      kind: 'upload',
      state: { $in: ['uploading', 'publishing'] },
      [field]: key,
    }).exec();
    if (inFlightUploadReference) return;

    await this.fileService.removeFile(key, type);
  }

  private async finalize(operation: ClaimedOperation): Promise<void> {
    await this.connection.transaction(async (session) => {
      if (operation.kind === 'delete') {
        const track = await this.trackModel.findById(operation.trackId).session(session).lean().exec();
        if (track && track.lifecycle !== 'deleting' && track.lifecycle !== 'deleted') {
          throw new Error('Delete operation track is not in a deletable lifecycle state');
        }
        if (track) {
          await this.trackModel.updateOne(
            { _id: operation.trackId, lifecycle: { $in: ['deleting', 'deleted'] } },
            { $set: { lifecycle: 'deleted' } },
            { session },
          ).exec();
        }
      }

      const completed = await this.operationModel.updateOne(
        {
          operationId: operation.operationId,
          state: 'cleanup',
          leaseToken: operation.leaseToken,
        },
        {
          $set: { state: 'done', nextAttemptAt: new Date() },
          $unset: { leaseOwner: '', leaseToken: '', leaseUntil: '' },
        },
        { session },
      ).exec();
      if (completed.matchedCount !== 1) throw new LostMaintenanceLeaseError();
    });
  }

  private async renewLease(operation: ClaimedOperation): Promise<void> {
    const updated = await this.operationModel.updateOne(
      {
        operationId: operation.operationId,
        state: 'cleanup',
        leaseToken: operation.leaseToken,
      },
      { $set: { leaseUntil: new Date(Date.now() + LEASE_DURATION_MS) } },
    ).exec();
    if (updated.matchedCount !== 1) throw new LostMaintenanceLeaseError();
  }

  private async scheduleRetry(operation: ClaimedOperation, error: unknown): Promise<void> {
    const delay = Math.min(5_000 * (2 ** Math.min(operation.attempts - 1, 6)), MAX_RETRY_DELAY_MS);
    try {
      await this.operationModel.updateOne(
        {
          operationId: operation.operationId,
          state: 'cleanup',
          leaseToken: operation.leaseToken,
        },
        {
          $set: {
            nextAttemptAt: new Date(Date.now() + delay),
            lastErrorCode: this.safeErrorCode(error),
          },
          $unset: { leaseOwner: '', leaseToken: '', leaseUntil: '' },
        },
      ).exec();
    } catch (retryError) {
      this.logger.error(`Could not schedule maintenance retry ${operation.operationId} (${this.safeErrorCode(retryError)})`);
    }
  }

  private safeErrorCode(error: unknown): string {
    const value = error as { code?: unknown; name?: unknown };
    const code = typeof value?.code === 'string'
      ? value.code
      : typeof value?.name === 'string' ? value.name : 'unknown';
    return /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : 'maintenance_failed';
  }
}

class LostMaintenanceLeaseError extends Error {
  constructor() {
    super('Maintenance lease was lost');
    this.name = 'LostMaintenanceLeaseError';
  }
}
