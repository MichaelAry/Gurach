import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { Queue, type QueueEntry } from './schemas/queue.schema.js';
import { assertQueueWrite, QUEUE_CAPACITY } from './queue-policy.js';
import type { QueueWriteDto } from './dto/queue-write.dto.js';
import { emptyQueue, type QueueResponseDto } from './dto/queue-response.dto.js';
import { TrackReadService } from '../track/track-read.service.js';
import { QueueError } from './queue-error.js';

@Injectable()
export class QueueService {
  constructor(@InjectModel(Queue.name) private readonly queues: Model<Queue>, private readonly tracks: TrackReadService) {}
  private async hydrate(row: Queue & { updatedAt?: Date }): Promise<QueueResponseDto> {
    const resolved = await this.tracks.resolve(row.entries.map((entry) => String(entry.trackId)));
    return { capacity: QUEUE_CAPACITY, revision: row.revision, updatedAt: row.updatedAt?.toISOString() ?? null,
      entries: row.entries.map((entry) => {
        const track = resolved.get(String(entry.trackId)) ?? null;
        const playable = Boolean(track?.audio);
        return { entryId: entry.entryId, trackId: String(entry.trackId), source: entry.source ?? 'manual', display: { name: entry.display.name, artist: entry.display.artist ?? null },
          track, availability: playable ? 'playable' : 'unavailable', reason: playable ? null : track ? 'missing-audio' : 'deleted' };
      }) };
  }
  async get(userId: string): Promise<QueueResponseDto> {
    const owner = new Types.ObjectId(userId);
    let row = await this.queues.findOne({ userId: owner }).exec();
    if (!row) {
      const tracks = await this.tracks.random();
      const entries = tracks.map((track) => ({ entryId: randomUUID(), trackId: new Types.ObjectId(track._id), source: 'automatic' as const,
        display: { name: track.name, artist: track.artist } }));
      try {
        row = await this.queues.create({ userId: owner, revision: 1, entries });
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
        row = await this.queues.findOne({ userId: owner }).exec();
      }
    }
    return row ? this.hydrate(row) : emptyQueue();
  }
  async put(userId: string, dto: QueueWriteDto): Promise<QueueResponseDto> {
    if (Array.isArray(dto.entries) && dto.entries.length > QUEUE_CAPACITY) throw new QueueError('QUEUE_FULL', 'Queue capacity exceeded');
    try { assertQueueWrite(dto); } catch { throw new QueueError('QUEUE_ENTRY_INVALID', 'Invalid queue write'); }
    const entries = dto.entries.map((entry) => ({ entryId: entry.entryId.toLowerCase(), trackId: entry.trackId.toLowerCase(), source: entry.source }));
    const mutationId = dto.mutationId.toLowerCase();
    const hash = createHash('sha256').update(JSON.stringify({ expectedRevision: dto.expectedRevision, mutationId, entries })).digest('hex');
    const owner = new Types.ObjectId(userId);
    const current = await this.queues.findOne({ userId: owner }).exec();
    if (current?.lastMutationId === mutationId) {
      if (current.lastMutationHash !== hash) throw new QueueError('QUEUE_ENTRY_INVALID', 'Mutation identity reused with different content');
      return this.hydrate(current);
    }
    if ((current?.revision ?? 0) !== dto.expectedRevision || dto.expectedRevision >= Number.MAX_SAFE_INTEGER) throw new QueueError('QUEUE_CONFLICT', 'Queue revision changed', 409);
    const previous = new Map(current?.entries.map((entry) => [entry.entryId, entry]) ?? []);
    const resolved = await this.tracks.resolve(entries.map((entry) => entry.trackId));
    const stored: QueueEntry[] = entries.map((entry) => {
      const old = previous.get(entry.entryId);
      if (old && String(old.trackId) !== entry.trackId) throw new QueueError('QUEUE_ENTRY_INVALID', 'Entry track identity is immutable');
      const track = resolved.get(entry.trackId);
      if (!old && !track?.audio) throw new QueueError('TRACK_UNAVAILABLE', 'Track is unavailable');
      return { entryId: entry.entryId, trackId: new Types.ObjectId(entry.trackId), source: entry.source ?? old?.source ?? 'manual', display: old?.display ?? { name: track!.name, artist: track!.artist } };
    });
    const update = { entries: stored, revision: dto.expectedRevision + 1, lastMutationId: mutationId, lastMutationHash: hash };
    try {
      const saved = current
        ? await this.queues.findOneAndUpdate({ userId: owner, revision: dto.expectedRevision }, { $set: update }, { returnDocument: 'after', runValidators: true }).exec()
        : await this.queues.create({ userId: owner, ...update });
      if (saved) return this.hydrate(saved);
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
    }
    const canonical = await this.queues.findOne({ userId: owner }).exec();
    if (canonical?.lastMutationId === mutationId) {
      if (canonical.lastMutationHash !== hash) throw new QueueError('QUEUE_ENTRY_INVALID', 'Mutation identity reused with different content');
      return this.hydrate(canonical);
    }
    throw new QueueError('QUEUE_CONFLICT', 'Queue revision changed', 409);
  }
}
