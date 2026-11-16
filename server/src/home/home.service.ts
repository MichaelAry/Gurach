import type { HomeReleasesPage, HomePopularResponse, HomeActivityPage, HomeDiscoveryResponse } from './home.contract.js';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Track } from '../track/schemas/track.schema.js';
import { Comment } from '../comment/schemas/comment.schema.js';
import { AccountListen } from '../account/listen.schema.js';
import { SocialRelation } from '../friends/schemas/social-relation.schema.js';
import { User } from '../auth/schemas/user.schema.js';
import { TrackReadService } from '../track/track-read.service.js';
import { toTrackListItem } from '../track/mappers/track.mapper.js';
import { decodeScopedCursor, encodeScopedCursor } from '../common/cursor.js';
import { createHash } from 'node:crypto';
import { AccountFavorite } from '../account/favorite.schema.js';
import { normalizeTrackIdentity } from '../track/track-identity.js';
import type { TrackListRecord } from '../track/mappers/track.mapper.js';

const available = { lifecycle: 'active', audio: { $type: 'string', $ne: '' } } as const;
const fingerprint = (list: string) => createHash('sha256').update(list).digest('hex');
interface ActivityPosition { v: 3; scope: string; at: string; id: string; kind: 'upload' | 'comment' }
@Injectable()
export class HomeService implements OnModuleInit {
  constructor(
    @InjectModel(Track.name) private readonly tracks: Model<Track>,
    @InjectModel(Comment.name) private readonly comments: Model<Comment>,
    @InjectModel(AccountListen.name)
    private readonly listens: Model<AccountListen>,
    @InjectModel(SocialRelation.name)
    private readonly relations: Model<SocialRelation>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly reader: TrackReadService,
    @InjectModel(AccountFavorite.name) private readonly favorites: Model<AccountFavorite>,
  ) {}
  async onModuleInit() {
    await Promise.all([
      this.tracks.collection.createIndex(
        { ownerId: 1, lifecycle: 1, _id: -1 },
        { name: 'track_owner_activity' },
      ),
      this.comments.collection.createIndex(
        { authorId: 1, _id: -1 },
        { name: 'comment_author_activity' },
      ),
      this.listens.collection.createIndex(
        { userId: 1, listenedAt: -1, _id: -1 },
        { name: 'home_listen_signal' },
      ),
      this.listens.collection.createIndex(
        { listenedAt: -1, trackId: 1 },
        { name: 'listen_week_tracks' },
      ),
    ]);
  }
  async releases(cursor?: string): Promise<HomeReleasesPage> {
    const scope = fingerprint('home:releases');
    let after: Types.ObjectId | null = null;
    try {
      if (cursor !== undefined) {
        const position = decodeScopedCursor(cursor);
        if (position.scope !== scope) throw new Error('Wrong list');
        after = new Types.ObjectId(position.after);
      }
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    const rows = await this.tracks
      .find({
        lifecycle: 'active',
        audio: { $type: 'string', $ne: '' },
        ...(after ? { _id: { $lt: after } } : {}),
      })
      .select('_id name artist audio picture duration listens')
      .sort({ _id: -1 })
      .limit(21)
      .lean()
      .exec();
    return {
      items: rows.slice(0, 20).map(toTrackListItem),
      nextCursor:
        rows.length > 20
          ? encodeScopedCursor({ after: String(rows[19]!._id), scope })
          : null,
    };
  }
  async popular(): Promise<HomePopularResponse> {
    const rows = await this.listens
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: { listenedAt: { $gte: new Date(Date.now() - 7 * 86400000) } },
        },
        { $group: { _id: '$trackId', count: { $sum: 1 } } },
        {
          $lookup: {
            from: 'tracks',
            localField: '_id',
            foreignField: '_id',
            as: 'track',
          },
        },
        {
          $match: {
            'track.lifecycle': 'active',
            'track.audio': { $type: 'string', $ne: '' },
          },
        },
        { $sort: { count: -1, _id: -1 } },
        { $limit: 6 },
      ])
      .exec();
    const tracks = await this.reader.resolve(
      rows.map((row) => String(row._id)),
    );
    return {
      items: rows.flatMap((row) => {
        const track = tracks.get(String(row._id));
        return track?.audio ? [track] : [];
      }),
    };
  }
  async discovery(userId: string): Promise<HomeDiscoveryResponse> {
    const me = new Types.ObjectId(userId);
    const [history, favorites] = await Promise.all([
      this.listens.find({ userId: me }).sort({ listenedAt: -1, _id: -1 }).limit(30).select('trackId').lean().exec(),
      this.favorites.find({ userId: me }).sort({ _id: -1 }).limit(30).select('trackId').lean().exec(),
    ]);
    const signalIds = [...new Set([...history, ...favorites].map((row) => String(row.trackId)))];
    const signals = await this.reader.resolve(signalIds);
    const artists = [...new Set([...signals.values()].flatMap((track) => track.audio && track.artist ? [track.artist] : []))];
    // Search the available catalogue, independently of the releases page.
    const matches = artists.length ? await this.tracks.find({
      ...available,
      _id: { $nin: signalIds.map((id) => new Types.ObjectId(id)) },
      $or: [{ artistKey: { $in: artists.map(normalizeTrackIdentity) } }, { artist: { $in: artists } }],
    }).select('_id name artist audio picture duration listens').sort({ _id: -1 }).limit(6).lean().exec() : [];
    if (matches.length) return { items: matches.map(toTrackListItem), basis: 'artists' };
    // This is a catalogue fallback, never presented as a personal prediction.
    return { items: [], basis: artists.length ? 'no-matches' : 'no-signal' };
  }

  async activity(userId: string, cursor?: string): Promise<HomeActivityPage> {
    const scope = fingerprint(`home:activity:${userId}`);
    let after: ActivityPosition | null = null;
    try {
      if (cursor !== undefined) {
        const bytes = Buffer.from(cursor, 'base64url');
        if (cursor.length > 512 || bytes.toString('base64url') !== cursor) throw new Error();
        const value = JSON.parse(bytes.toString('utf8')) as ActivityPosition;
        if (!value || Object.keys(value).length !== 5 || value.v !== 3 || value.scope !== scope
          || typeof value.id !== 'string' || !/^[a-f0-9]{24}$/.test(value.id)
          || typeof value.at !== 'string' || new Date(value.at).toISOString() !== value.at
          || !['upload', 'comment'].includes(value.kind)) throw new Error();
        after = value;
      }
    } catch {
      throw new BadRequestException('Invalid cursor for this account or list');
    }
    const me = new Types.ObjectId(userId);
    const relations = await this.relations.find({
      $or: [{ userLowId: me }, { userHighId: me }],
      status: 'accepted', blockedByLow: false, blockedByHigh: false,
    }).select('userLowId userHighId').lean().exec();
    const ids = relations.map((row) => row.userLowId.equals(me) ? row.userHighId : row.userLowId);
    const users = await this.users.find({ _id: { $in: ids }, disabled: false }).select('username displayName').lean().exec();
    const authors = new Map(users.map((row) => [String(row._id), { username: row.username, displayName: row.displayName }]));
    const authorIds = users.map((row) => row._id);
    if (!authorIds.length) return { items: [], nextCursor: null };
    const rows = await this.comments.aggregate<{
      _id: Types.ObjectId; authorId: Types.ObjectId; kind: 'upload' | 'comment';
      action: 'upload' | 'comment' | 'rating'; at: Date; track: TrackListRecord;
    }>([
      { $match: { authorId: { $in: authorIds }, migrationQuarantineId: { $exists: false } } },
      { $project: { authorId: 1, trackId: '$track_id', kind: { $literal: 'comment' },
        action: { $cond: ['$rating', 'rating', 'comment'] }, at: { $ifNull: ['$createdAt', { $toDate: '$_id' }] } } },
      { $unionWith: { coll: this.tracks.collection.name, pipeline: [
        { $match: { ...available, ownerId: { $in: authorIds } } },
        { $project: { authorId: '$ownerId', trackId: '$_id', kind: { $literal: 'upload' },
          action: { $literal: 'upload' }, at: { $ifNull: ['$publishedAt', { $toDate: '$_id' }] } } },
      ] } },
      ...(after ? [{ $match: { $or: [
        { at: { $lt: new Date(after.at) } },
        { at: new Date(after.at), _id: { $lt: new Types.ObjectId(after.id) } },
        { at: new Date(after.at), _id: new Types.ObjectId(after.id), kind: { $lt: after.kind } },
      ] } }] : []),
      // Resolve active tracks BEFORE limiting so deleted rows cannot consume a page.
      { $lookup: { from: this.tracks.collection.name, localField: 'trackId', foreignField: '_id',
        pipeline: [{ $match: available }, { $project: { name: 1, artist: 1, audio: 1, picture: 1, duration: 1, listens: 1 } }], as: 'track' } },
      { $unwind: '$track' },
      { $sort: { at: -1, _id: -1, kind: -1 } },
      { $limit: 21 },
    ]).exec();
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({ id: String(row._id), user: authors.get(String(row.authorId))!,
        action: row.action, track: toTrackListItem(row.track), at: row.at.toISOString() })),
      nextCursor: rows.length > 20 && last ? Buffer.from(JSON.stringify({
        v: 3, scope, at: last.at.toISOString(), id: String(last._id), kind: last.kind,
      } satisfies ActivityPosition)).toString('base64url') : null,
    };
  }
}
