import { AccountFavorite } from './favorite.schema.js';
import { BadRequestException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Types, type Connection, type Model } from 'mongoose';
import { createHash } from 'node:crypto';
import { AccountListen } from './listen.schema.js';
import { Track } from '../track/schemas/track.schema.js';
import { Comment } from '../comment/schemas/comment.schema.js';
import { TrackReadService } from '../track/track-read.service.js';
import { toTrackListItem } from '../track/mappers/track.mapper.js';
import { decodeScopedCursor, encodeScopedCursor } from '../common/cursor.js';
import type { ListTracksQuery } from '../track/dto/list-tracks-query.dto.js';
import type { AccountHistoryPage, AccountStatistics, RecordAccountListenDto } from './account.contract.js';
import type { ListenResult, TrackListPage } from '../contracts/track.contract.js';

@Injectable()
export class AccountService implements OnModuleInit {
  constructor(
    @InjectModel(AccountFavorite.name) private readonly favoriteEntries: Model<AccountFavorite>,
    @InjectModel(AccountListen.name) private readonly listens: Model<AccountListen>,
    @InjectModel(Track.name) private readonly tracks: Model<Track>,
    @InjectModel(Comment.name) private readonly comments: Model<Comment>,
    @InjectConnection() private readonly connection: Connection,
    private readonly trackReader: TrackReadService,
  ) {}

  async onModuleInit() {
    // autoIndex is disabled globally; provision the account collections' unique
    // keys before accepting concurrent favorites and listen writes.
    await this.favoriteEntries.createCollection();
    await this.favoriteEntries.createIndexes();
    await this.listens.createCollection();
    await this.listens.createIndexes();
  }

  async statistics(userId: string): Promise<AccountStatistics> {
    const owner = new Types.ObjectId(userId);
    const [uploads, listening, comments] = await Promise.all([
      this.tracks.aggregate<{ count: number; listens: number }>([
        { $match: { ownerId: owner, lifecycle: 'active' } },
        { $group: { _id: null, count: { $sum: 1 }, listens: { $sum: { $ifNull: ['$listens', 0] } } } },
      ]).exec(),
      this.listens.aggregate<{ total: number; unique: number }>([
        { $match: { userId: owner } },
        { $group: { _id: '$trackId', count: { $sum: 1 } } },
        { $group: { _id: null, total: { $sum: '$count' }, unique: { $sum: 1 } } },
      ]).exec(),
      this.comments.countDocuments({ authorId: owner, migrationQuarantineId: { $exists: false } }).exec(),
    ]);
    return {
      uploadedTracks: uploads[0]?.count ?? 0,
      receivedListens: uploads[0]?.listens ?? 0,
      totalListens: listening[0]?.total ?? 0,
      uniqueTracks: listening[0]?.unique ?? 0,
      comments,
    };
  }

  private position(userId: string, kind: 'uploads' | 'history' | 'favorites', query: ListTracksQuery) {
    const scope = createHash('sha256').update(`account:${kind}:${userId}`).digest('hex');
    const cursor = query.cursor ? decodeScopedCursor(query.cursor) : null;
    if (cursor && cursor.scope !== scope) throw new BadRequestException('Cursor belongs to a different account or list');
    return { scope, after: cursor ? new Types.ObjectId(cursor.after) : null };
  }

  async uploads(userId: string, query: ListTracksQuery): Promise<TrackListPage> {
    const { scope, after } = this.position(userId, 'uploads', query);
    const rows = await this.tracks.find({ ownerId: new Types.ObjectId(userId), lifecycle: 'active', ...(after ? { _id: { $lt: after } } : {}) })
      .select('_id name artist audio picture duration listens').sort({ _id: -1 }).limit(query.count + 1).lean().exec();
    const items = rows.slice(0, query.count);
    return { items: items.map(toTrackListItem), nextCursor: rows.length > query.count ? encodeScopedCursor({ after: String(items.at(-1)!._id), scope }) : null };
  }

  async history(userId: string, query: ListTracksQuery): Promise<AccountHistoryPage> {
    const { scope, after } = this.position(userId, 'history', query);
    const rows = await this.listens.find({ userId: new Types.ObjectId(userId), ...(after ? { _id: { $lt: after } } : {}) })
      .sort({ _id: -1 }).limit(query.count + 1).lean().exec();
    const page = rows.slice(0, query.count);
    const tracks = await this.trackReader.resolve(page.map((row) => String(row.trackId)));
    return {
      items: page.map((row) => ({ id: String(row._id), trackId: String(row.trackId), listenedAt: row.listenedAt.toISOString(), track: tracks.get(String(row.trackId)) ?? null })),
      nextCursor: rows.length > query.count ? encodeScopedCursor({ after: String(page.at(-1)!._id), scope }) : null,
    };
  }

  async favoriteIds(userId: string): Promise<string[]> {
    const rows = await this.favoriteEntries.find({ userId: new Types.ObjectId(userId) }).select('trackId').lean().exec();
    return rows.map((row) => String(row.trackId));
  }

  async favorites(userId: string, query: ListTracksQuery): Promise<TrackListPage> {
    const { scope, after } = this.position(userId, 'favorites', query);
    const rows = await this.favoriteEntries.find({ userId: new Types.ObjectId(userId), ...(after ? { _id: { $lt: after } } : {}) })
      .sort({ _id: -1 }).limit(query.count + 1).lean().exec();
    const page = rows.slice(0, query.count);
    const tracks = await this.trackReader.resolve(page.map((row) => String(row.trackId)));
    return {
      items: page.flatMap((row) => { const track = tracks.get(String(row.trackId)); return track ? [track] : []; }),
      nextCursor: rows.length > query.count ? encodeScopedCursor({ after: String(page.at(-1)!._id), scope }) : null,
    };
  }

  async setFavorite(userId: string, id: string, favorite: boolean): Promise<void> {
    if (!/^[a-f\d]{24}$/i.test(id)) throw new BadRequestException('Invalid track id');
    const key = { userId: new Types.ObjectId(userId), trackId: new Types.ObjectId(id) };
    if (!favorite) { await this.favoriteEntries.deleteOne(key).exec(); return; }
    if (!await this.tracks.exists({ _id: key.trackId, lifecycle: 'active' })) throw new NotFoundException('Track is unavailable');
    try {
      await this.favoriteEntries.updateOne(key, { $setOnInsert: key }, { upsert: true }).exec();
    } catch (error) {
      // Concurrent additions are idempotent thanks to the unique user/track index.
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
    }
  }

  async recordListen(userId: string, dto: RecordAccountListenDto): Promise<ListenResult> {
    const user = new Types.ObjectId(userId), trackId = new Types.ObjectId(dto.trackId);
    const key = { userId: user, playbackId: dto.playbackId.toLowerCase() };
    const repeated = (row: AccountListen): ListenResult => {
      if (!row.trackId.equals(trackId)) throw new BadRequestException('Playback identity already belongs to another track');
      return { listens: row.resultingListens };
    };
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const previous = await this.listens.findOne(key).session(session).exec();
        if (previous) return repeated(previous);
        const track = await this.tracks.findOneAndUpdate({ _id: trackId, lifecycle: 'active', audio: { $type: 'string', $ne: '' } },
          { $inc: { listens: 1 } }, { session, returnDocument: 'after' }).select('listens').exec();
        if (!track) throw new NotFoundException('Track is unavailable');
        await this.listens.create([{ ...key, trackId, listenedAt: new Date(), resultingListens: track.listens }], { session });
        return { listens: track.listens };
      });
    } catch (error) {
      // A concurrent retry can lose the unique-key race after its transaction
      // snapshot. Return the committed result without incrementing again.
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        const previous = await this.listens.findOne(key).exec();
        if (previous) return repeated(previous);
      }
      throw error;
    } finally { await session.endSession(); }
  }
}
