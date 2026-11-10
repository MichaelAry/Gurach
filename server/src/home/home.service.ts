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
import { decodeCursor, encodeCursor } from '../common/cursor.js';
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
        { listenedAt: -1, trackId: 1 },
        { name: 'listen_week_tracks' },
      ),
    ]);
  }
  async releases(cursor?: string) {
    let after: Types.ObjectId | null = null;
    try {
      if (cursor) after = new Types.ObjectId(decodeCursor(cursor).after);
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
          ? encodeCursor({ after: String(rows[19]!._id) })
          : null,
    };
  }
  async popular() {
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
  async activity(userId: string, cursor?: string) {
    let after: Types.ObjectId | null = null;
    try {
      if (cursor) after = new Types.ObjectId(decodeCursor(cursor).after);
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    const me = new Types.ObjectId(userId);
    const relations = await this.relations
      .find({
        $or: [{ userLowId: me }, { userHighId: me }],
        status: 'accepted',
        blockedByLow: false,
        blockedByHigh: false,
      })
      .select('userLowId userHighId')
      .lean()
      .exec();
    const ids = relations.map((row) =>
      row.userLowId.equals(me) ? row.userHighId : row.userLowId,
    );
    const users = await this.users
      .find({ _id: { $in: ids }, disabled: false })
      .select('username displayName')
      .lean()
      .exec();
    const authors = new Map(
      users.map((row) => [
        String(row._id),
        { username: row.username, displayName: row.displayName },
      ]),
    );
    const authorIds = users.map((row) => row._id);
    const position = after ? { _id: { $lt: after } } : {};
    const [uploads, comments] = await Promise.all([
      this.tracks
        .find({
          ownerId: { $in: authorIds },
          lifecycle: 'active',
          audio: { $type: 'string', $ne: '' },
          ...position,
        })
        .sort({ _id: -1 })
        .limit(21)
        .lean()
        .exec(),
      this.comments
        .find({
          authorId: { $in: authorIds },
          migrationQuarantineId: { $exists: false },
          ...position,
        })
        .sort({ _id: -1 })
        .limit(21)
        .lean()
        .exec(),
    ]);
    const resolved = await this.reader.resolve(
      comments.map((row) => String(row.track_id)),
    );
    const candidates = [
      ...uploads.map((row) => ({
        id: String(row._id),
        user: authors.get(String(row.ownerId))!,
        action: 'upload',
        track: toTrackListItem(row),
        at: row._id.getTimestamp().toISOString(),
      })),
      ...comments.map((row) => ({
        id: String(row._id),
        user: authors.get(String(row.authorId))!,
        action: row.rating ? 'rating' : 'comment',
        track: resolved.get(String(row.track_id)) ?? null,
        at:
          row.createdAt?.toISOString() ?? row._id.getTimestamp().toISOString(),
      })),
    ].sort((a, b) => b.id.localeCompare(a.id));
    const page = candidates.slice(0, 20);
    return {
      items: page.filter((row) => row.track?.audio),
      nextCursor:
        candidates.length > 20
          ? encodeCursor({ after: page.at(-1)!.id })
          : null,
    };
  }
}
