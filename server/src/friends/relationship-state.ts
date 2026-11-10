import { Types } from 'mongoose';
import type { SocialRelation } from './schemas/social-relation.schema.js';
import type { FriendRelationship } from './friends.contract.js';
export function relationPair(a: string, b: string) {
  if (!Types.ObjectId.isValid(a) || !Types.ObjectId.isValid(b)) throw new Error('Invalid user ID');
  const x = new Types.ObjectId(a), y = new Types.ObjectId(b);
  if (x.equals(y)) throw new Error('Cannot create self relationship');
  return x.toHexString() < y.toHexString() ? { userLowId: x, userHighId: y } : { userLowId: y, userHighId: x };
}
export function relationship(actorId: string, targetId: string, row?: SocialRelation | null): FriendRelationship {
  if (actorId === targetId) return { status: 'self', revision: null, requestId: null, friendsSince: null };
  relationPair(actorId, targetId);
  const low = row?.userLowId.toHexString() === actorId;
  const own = low ? row?.blockedByLow : row?.blockedByHigh;
  const other = low ? row?.blockedByHigh : row?.blockedByLow;
  // Conceal both the reason for unavailability and the other participant's revision.
  if (other && !own) return { status: 'unavailable', revision: null, requestId: null, friendsSince: null };
  return {
    status: own ? 'blocked_by_me' : row?.status === 'accepted' ? 'friends' : row?.status === 'pending' ? row.requesterId?.toHexString() === actorId ? 'outgoing' : 'incoming' : 'none',
    revision: row?.revision ?? null,
    requestId: !own && row?.status === 'pending' ? row.requestId ?? null : null,
    friendsSince: !own && row?.status === 'accepted' ? row.acceptedAt!.toISOString() : null,
  };
}
