import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Types, type Connection, type Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { User } from '../auth/schemas/user.schema.js';
import { SocialRelation } from './schemas/social-relation.schema.js';
import { FriendRequestCounter } from './schemas/friend-request-counter.schema.js';
import { relationship, relationPair } from './relationship-state.js';
import { decodeSocialCursor, encodeSocialCursor, socialScope } from './social-cursor.js';
import type { FriendListPage, FriendRelationship, FriendsSummary, ListFriendsDto } from './friends.contract.js';

export const FRIEND_LIMITS = {
  dailyRequests: 30, pendingOutgoing: 50,
  cancelCooldownMs: 5 * 60_000, rejectCooldownMs: 24 * 60 * 60_000, unfriendCooldownMs: 24 * 60 * 60_000,
};
const inactiveFields = { requestId: '', requesterId: '', recipientId: '', requestedAt: '', acceptedAt: '' };
const duplicateKey = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 11000;
type RelationRow = SocialRelation & { _id: Types.ObjectId };

@Injectable()
export class FriendsService {
  constructor(
    @InjectModel(SocialRelation.name) private readonly relations: Model<SocialRelation>,
    @InjectModel(FriendRequestCounter.name) private readonly counters: Model<FriendRequestCounter>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private pair(actorId: string, targetId: string) {
    try { return relationPair(actorId, targetId); }
    catch { throw new BadRequestException('Invalid relationship participants'); }
  }
  private uuid(value: string) {
    if (!isUUID(value, '4')) throw new BadRequestException('Invalid request ID');
    return value.toLowerCase();
  }
  private limited(until: Date): never {
    const error = new HttpException('Friend request limit reached', 429) as HttpException & { retryAfter: number };
    error.retryAfter = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
    throw error;
  }
  private async active(targetId: string) {
    if (!await this.users.exists({ _id: new Types.ObjectId(targetId), disabled: false })) throw new NotFoundException('User unavailable');
  }
  private visible(actorId: string, targetId: string, row: SocialRelation | null) {
    const state = relationship(actorId, targetId, row);
    if (state.status === 'unavailable' || state.status === 'blocked_by_me') throw new NotFoundException('User unavailable');
    return state;
  }

  async relationships(actorId: string, targetIds: string[]): Promise<Map<string, FriendRelationship>> {
    const pairs = targetIds.filter((id) => id !== actorId).map((id) => this.pair(actorId, id));
    const rows = pairs.length ? await this.relations.find({ $or: pairs }).lean().exec() : [];
    const byTarget = new Map(rows.map((row) => [String(row.userLowId) === actorId ? String(row.userHighId) : String(row.userLowId), row]));
    return new Map(targetIds.map((id) => [id, relationship(actorId, id, byTarget.get(id))]));
  }
  async blockedIds(actorId: string): Promise<Types.ObjectId[]> {
    const actor = new Types.ObjectId(actorId);
    const rows = await this.relations.find({ $and: [
      { $or: [{ userLowId: actor }, { userHighId: actor }] },
      { $or: [{ blockedByLow: true }, { blockedByHigh: true }] },
    ] }).select('userLowId userHighId').lean().exec();
    return rows.map((row) => row.userLowId.equals(actor) ? row.userHighId : row.userLowId);
  }

  async request(actorId: string, rawTargetId: string): Promise<{ created: boolean; relationship: FriendRelationship }> {
    const pair = this.pair(actorId, rawTargetId);
    const targetId = new Types.ObjectId(rawTargetId).toHexString();
    const actor = new Types.ObjectId(actorId), target = new Types.ObjectId(targetId);
    // Retry initial unique-key races outside the aborted transaction. MongoDB's
    // withTransaction separately retries write conflicts against existing rows.
    for (let attempt = 0; attempt < 4; attempt++) {
      const session = await this.connection.startSession();
      try {
        return await session.withTransaction(async () => {
          if (!await this.users.exists({ _id: target, disabled: false }).session(session)) throw new NotFoundException('User unavailable');
          const existing = await this.relations.findOne(pair).session(session).lean().exec();
          const state = this.visible(actorId, targetId, existing);
          if (state.status === 'outgoing' || state.status === 'friends') return { created: false, relationship: state };
          if (state.status === 'incoming') throw new ConflictException('Incoming request exists');
          const now = new Date();
          if (existing?.nextRequestAllowedAt && existing.nextRequestAllowedAt > now) this.limited(existing.nextRequestAllowedAt);
          // A persistent per-actor write fence serializes quota admission even
          // across UTC midnight and requests to different recipients.
          await this.counters.updateOne({ userId: actor, day: '*' }, { $inc: { count: 1 } }, { upsert: true, session }).exec();
          const pending = await this.relations.countDocuments({ requesterId: actor, status: 'pending' }).session(session).exec();
          if (pending >= FRIEND_LIMITS.pendingOutgoing) this.limited(new Date(now.getTime() + 60_000));
          const day = now.toISOString().slice(0, 10);
          const tomorrow = new Date(`${day}T00:00:00.000Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          const counter = await this.counters.findOneAndUpdate(
            { userId: actor, day, count: { $lt: FRIEND_LIMITS.dailyRequests } },
            { $inc: { count: 1 } }, { session, returnDocument: 'after' },
          ).exec();
          if (!counter) {
            if (await this.counters.exists({ userId: actor, day }).session(session)) this.limited(tomorrow);
            await this.counters.create([{ userId: actor, day, count: 1 }], { session });
          }
          const fields = { status: 'pending' as const, requestId: randomUUID(), requesterId: actor, recipientId: target, requestedAt: now };
          let updated: SocialRelation;
          if (existing) {
            const result = await this.relations.findOneAndUpdate(
              { ...pair, revision: existing.revision, status: 'none', blockedByLow: false, blockedByHigh: false,
                $or: [{ nextRequestAllowedAt: { $exists: false } }, { nextRequestAllowedAt: { $lte: now } }] },
              { $set: fields, $unset: { acceptedAt: '', nextRequestAllowedAt: '' }, $inc: { revision: 1 } },
              { session, returnDocument: 'after' },
            ).exec();
            if (!result) throw new ConflictException('Relationship changed');
            updated = result;
          } else {
            [updated] = await this.relations.create([{ ...pair, ...fields, revision: 1 }], { session });
          }
          return { created: true, relationship: relationship(actorId, targetId, updated) };
        });
      } catch (error) {
        if (!duplicateKey(error)) throw error;
      } finally { await session.endSession(); }
    }
    // Resolve the committed winner without spending quota on the losing retry.
    const row = await this.relations.findOne(pair).lean().exec();
    const state = this.visible(actorId, targetId, row);
    if (state.status === 'outgoing' || state.status === 'friends') return { created: false, relationship: state };
    if (row?.nextRequestAllowedAt && row.nextRequestAllowedAt > new Date()) this.limited(row.nextRequestAllowedAt);
    throw new ConflictException('Relationship changed; retry');
  }

  async accept(actorId: string, value: string): Promise<FriendRelationship> {
    const requestId = this.uuid(value);
    const row = await this.relations.findOne({ requestId, status: 'pending' }).lean().exec();
    if (!row) throw new ConflictException('Request is no longer active');
    if (String(row.recipientId) !== actorId) throw new ForbiddenException();
    const targetId = String(row.requesterId);
    const pair = this.pair(actorId, targetId);
    await this.active(targetId);
    const updated = await this.relations.findOneAndUpdate(
      { ...pair, requestId, recipientId: new Types.ObjectId(actorId), status: 'pending', blockedByLow: false, blockedByHigh: false },
      { $set: { status: 'accepted', acceptedAt: new Date() }, $unset: { requestId: '', requesterId: '', recipientId: '', requestedAt: '', nextRequestAllowedAt: '' }, $inc: { revision: 1 } },
      { returnDocument: 'after' },
    ).exec();
    if (!updated) throw new ConflictException('Request is no longer active');
    return relationship(actorId, targetId, updated);
  }

  async cancelOrReject(actorId: string, value: string): Promise<void> {
    const requestId = this.uuid(value);
    const row = await this.relations.findOne({ requestId, status: 'pending' }).lean().exec();
    if (!row) throw new ConflictException('Request is no longer active');
    const sender = String(row.requesterId) === actorId;
    if (!sender && String(row.recipientId) !== actorId) throw new ForbiddenException();
    const targetId = String(sender ? row.recipientId : row.requesterId);
    const result = await this.relations.updateOne(
      { ...this.pair(actorId, targetId), requestId, status: 'pending', $or: [{ requesterId: new Types.ObjectId(actorId) }, { recipientId: new Types.ObjectId(actorId) }] },
      { $set: { status: 'none', nextRequestAllowedAt: new Date(Date.now() + (sender ? FRIEND_LIMITS.cancelCooldownMs : FRIEND_LIMITS.rejectCooldownMs)) }, $unset: inactiveFields, $inc: { revision: 1 } },
    ).exec();
    if (!result.modifiedCount) throw new ConflictException('Request is no longer active');
  }

  async remove(actorId: string, targetId: string, expectedRevision: number): Promise<void> {
    const result = await this.relations.updateOne(
      { ...this.pair(actorId, targetId), status: 'accepted', revision: expectedRevision },
      { $set: { status: 'none', nextRequestAllowedAt: new Date(Date.now() + FRIEND_LIMITS.unfriendCooldownMs) }, $unset: inactiveFields, $inc: { revision: 1 } },
    ).exec();
    if (!result.modifiedCount) throw new ConflictException('Relationship changed');
  }

  async block(actorId: string, targetId: string, expectedRevision: number, blocked: boolean): Promise<void> {
    const pair = this.pair(actorId, targetId);
    const flag = String(pair.userLowId) === actorId ? 'blockedByLow' : 'blockedByHigh';
    const row = await this.relations.findOne(pair).lean().exec();
    if ((row?.revision ?? 0) !== expectedRevision) throw new ConflictException('Relationship changed');
    if (!row) {
      if (!blocked) return;
      await this.active(targetId);
      try { await this.relations.create({ ...pair, [flag]: true, status: 'none', revision: 1 }); }
      catch (error) { if (duplicateKey(error)) throw new ConflictException('Relationship changed'); throw error; }
      return;
    }
    if (row[flag] === blocked) return;
    const result = await this.relations.updateOne(
      { ...pair, revision: expectedRevision },
      blocked ? { $set: { [flag]: true, status: 'none' }, $unset: inactiveFields, $inc: { revision: 1 } }
        : { $set: { [flag]: false }, $inc: { revision: 1 } },
    ).exec();
    if (!result.modifiedCount) throw new ConflictException('Relationship changed');
  }

  private listFilter(actorId: string, kind: string) {
    const actor = new Types.ObjectId(actorId);
    if (kind === 'incoming') return { status: 'pending', recipientId: actor, blockedByLow: false, blockedByHigh: false };
    if (kind === 'outgoing') return { status: 'pending', requesterId: actor, blockedByLow: false, blockedByHigh: false };
    if (kind === 'blocks') return { $or: [{ userLowId: actor, blockedByLow: true }, { userHighId: actor, blockedByHigh: true }] };
    return { status: 'accepted', blockedByLow: false, blockedByHigh: false, $or: [{ userLowId: actor }, { userHighId: actor }] };
  }

  async list(actorId: string, query: ListFriendsDto, kind: 'friends' | 'incoming' | 'outgoing' | 'blocks' = 'friends'): Promise<FriendListPage> {
    const scope = socialScope(actorId, kind), cursor = decodeSocialCursor(query.cursor, scope);
    const field = kind === 'friends' ? 'acceptedAt' : kind === 'blocks' ? '_id' : 'requestedAt';
    if (cursor && field !== '_id' && (!/^\d{4}-\d{2}-\d{2}T/.test(cursor.value) || !Number.isFinite(Date.parse(cursor.value)))) throw new BadRequestException('Invalid cursor date');
    const after = cursor ? new Types.ObjectId(cursor.after) : null;
    const position = after ? field === '_id' ? { _id: { $lt: after } } : { $or: [
      { [field]: { $lt: new Date(cursor!.value) } }, { [field]: new Date(cursor!.value), _id: { $lt: after } },
    ] } : {};
    // Filter unavailable users inside MongoDB before limiting the page.
    const rows = await this.relations.aggregate<RelationRow & { profile: { _id: Types.ObjectId; username: string; displayName: string } }>([
      { $match: { $and: [this.listFilter(actorId, kind), position] } },
      { $sort: field === '_id' ? { _id: -1 } : { [field]: -1, _id: -1 } },
      { $set: { targetId: { $cond: [{ $eq: ['$userLowId', new Types.ObjectId(actorId)] }, '$userHighId', '$userLowId'] } } },
      { $lookup: { from: this.users.collection.name, localField: 'targetId', foreignField: '_id', pipeline: [
        { $match: kind === 'blocks' ? {} : { disabled: false } }, { $project: { _id: 1, username: 1, displayName: 1 } },
      ], as: 'profile' } },
      { $unwind: '$profile' }, { $limit: query.count + 1 },
    ]).exec();
    const page = rows.slice(0, query.count), last = page.at(-1);
    return {
      items: page.map((row) => ({ id: String(row.profile._id), username: row.profile.username, displayName: row.profile.displayName,
        relationship: relationship(actorId, String(row.profile._id), row), requestedAt: row.requestedAt?.toISOString() ?? null })),
      nextCursor: rows.length > query.count && last ? encodeSocialCursor(scope, String(last._id), field === '_id' ? '' : last[field]!.toISOString()) : null,
    };
  }

  async summary(actorId: string): Promise<FriendsSummary> {
    // Match the same active-user visibility as each paginated list.
    const counts = await Promise.all((['friends', 'incoming', 'outgoing', 'blocks'] as const).map(async (kind) => {
      const rows = await this.relations.aggregate<{ count: number }>([
        { $match: this.listFilter(actorId, kind) },
        { $set: { targetId: { $cond: [{ $eq: ['$userLowId', new Types.ObjectId(actorId)] }, '$userHighId', '$userLowId'] } } },
        { $lookup: { from: this.users.collection.name, localField: 'targetId', foreignField: '_id', pipeline: [
          { $match: kind === 'blocks' ? {} : { disabled: false } }, { $project: { _id: 1 } },
        ], as: 'profile' } }, { $unwind: '$profile' }, { $count: 'count' },
      ]).exec();
      return rows[0]?.count ?? 0;
    }));
    return { friendsCount: counts[0], incomingRequestsCount: counts[1], outgoingRequestsCount: counts[2], blockedUsersCount: counts[3] };
  }
}
