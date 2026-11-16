import { BadRequestException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type ClientSession, type Model, type PipelineStage } from 'mongoose';
import { createHash } from 'node:crypto';
import { Notification } from './notification.schema.js';
import { decodeScopedCursor, encodeScopedCursor } from '../common/cursor.js';
import type { ListNotificationsDto, NotificationsPage, UnreadNotifications } from './notifications.contract.js';

type VisibleNotification = Notification & {
  _id: Types.ObjectId;
  actor: { username: string; displayName: string };
  track?: { name: string };
};
@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(@InjectModel(Notification.name) private readonly notifications: Model<Notification>) {}

  async onModuleInit() {
    // autoIndex is disabled; the unique event key must exist before writes begin.
    await this.notifications.createCollection();
    await this.notifications.createIndexes();
  }

  /** Call only inside the source action's transaction. No private history is copied. */
  async record(event: Omit<Notification, 'readAt' | 'createdAt'>, session: ClientSession, createdAt = new Date()) {
    if (event.actorId.equals(event.recipientId)) return;
    await this.notifications.updateOne({ eventKey: event.eventKey }, {
      $setOnInsert: { ...event, createdAt, readAt: null },
    }, { upsert: true, session }).exec();
  }

  // One visibility policy for pages, unread counts and read mutations. Joins
  // precede pagination so removed/blocked events never consume a visible slot.
  private visible(recipientId: string, extra: Record<string, unknown> = {}, ordered = false): PipelineStage[] {
    return [
      { $match: { recipientId: new Types.ObjectId(recipientId), ...extra } },
      ...(ordered ? [{ $sort: { _id: -1 as const } }] : []),
      { $lookup: { from: 'users', localField: 'actorId', foreignField: '_id',
        pipeline: [{ $match: { disabled: false } }, { $project: { username: 1, displayName: 1 } }], as: 'actor' } },
      { $unwind: '$actor' },
      { $lookup: { from: 'social_relations', let: {
        low: { $cond: [{ $lt: ['$actorId', '$recipientId'] }, '$actorId', '$recipientId'] },
        high: { $cond: [{ $lt: ['$actorId', '$recipientId'] }, '$recipientId', '$actorId'] },
      }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$userLowId', '$$low'] }, { $eq: ['$userHighId', '$$high'] }] } } }], as: 'relations' } },
      { $match: { relations: { $not: { $elemMatch: { $or: [{ blockedByLow: true }, { blockedByHigh: true }] } } } } },
      { $lookup: { from: 'tracks', localField: 'trackId', foreignField: '_id',
        let: { recipient: '$recipientId' }, pipeline: [{ $match: { lifecycle: 'active', audio: { $type: 'string', $ne: '' },
          $expr: { $eq: ['$ownerId', '$$recipient'] } } }, { $project: { name: 1 } }], as: 'tracks' } },
      { $lookup: { from: 'comments', localField: 'commentId', foreignField: '_id',
        let: { track: '$trackId', author: '$actorId' }, pipeline: [{ $match: { migrationQuarantineId: { $exists: false },
          $expr: { $and: [{ $eq: ['$track_id', '$$track'] }, { $eq: ['$authorId', '$$author'] }] } } }, { $project: { _id: 1 } }], as: 'comments' } },
      { $match: { $expr: { $and: [
        { $ne: ['$actorId', '$recipientId'] },
        { $or: [
          { $and: [{ $eq: ['$kind', 'track.commented'] }, { $gt: [{ $size: '$tracks' }, 0] }, { $gt: [{ $size: '$comments' }, 0] }] },
          { $eq: ['$kind', 'friend.accepted'] },
          { $and: [{ $eq: ['$kind', 'friend.requested'] }, { $gt: [{ $size: { $filter: {
            input: '$relations', as: 'relation', cond: { $and: [
              { $eq: ['$$relation.status', 'pending'] }, { $eq: ['$$relation.requestId', '$requestId'] },
              { $eq: ['$$relation.recipientId', '$recipientId'] }, { $eq: ['$$relation.requesterId', '$actorId'] },
            ] },
          } } }, 0] }] },
        ] },
      ] } } },
      { $set: { track: { $arrayElemAt: ['$tracks', 0] } } },
      { $project: { relations: 0, tracks: 0, comments: 0, eventKey: 0, requestId: 0 } },
    ];
  }

  async list(recipientId: string, query: ListNotificationsDto): Promise<NotificationsPage> {
    const scope = createHash('sha256').update(`notifications:${recipientId}`).digest('hex');
    let after: Types.ObjectId | undefined;
    try {
      if (query.cursor !== undefined) {
        const position = decodeScopedCursor(query.cursor);
        if (position.scope !== scope) throw new Error();
        after = new Types.ObjectId(position.after);
      }
    } catch { throw new BadRequestException('Invalid cursor for this inbox'); }
    const rows = await this.notifications.aggregate<VisibleNotification>([
      ...this.visible(recipientId, after ? { _id: { $lt: after } } : {}, true),
      { $limit: query.count + 1 },
    ]).exec();
    const page = rows.slice(0, query.count), last = page.at(-1);
    return {
      items: page.map((row) => ({ id: String(row._id), kind: row.kind,
        actor: { username: row.actor.username, displayName: row.actor.displayName },
        createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null,
        trackId: row.trackId ? String(row.trackId) : null, commentId: row.commentId ? String(row.commentId) : null,
        trackName: row.track?.name ?? null,
      })),
      nextCursor: rows.length > query.count && last ? encodeScopedCursor({ after: String(last._id), scope }) : null,
    };
  }

  async unread(recipientId: string): Promise<UnreadNotifications> {
    const rows = await this.notifications.aggregate<{ count: number }>([
      ...this.visible(recipientId, { readAt: null }), { $count: 'count' },
    ]).exec();
    return { count: rows[0]?.count ?? 0 };
  }

  async markRead(recipientId: string, id: string): Promise<void> {
    if (!/^[a-f\d]{24}$/i.test(id)) throw new BadRequestException('Invalid notification ID');
    const _id = new Types.ObjectId(id);
    const rows = await this.notifications.aggregate([...this.visible(recipientId, { _id }), { $limit: 1 }]).exec();
    if (!rows.length) throw new NotFoundException('Notification unavailable');
    await this.notifications.updateOne({ _id, recipientId: new Types.ObjectId(recipientId), readAt: null }, { $set: { readAt: new Date() } }).exec();
  }
}
