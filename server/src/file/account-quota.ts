import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { Types, type Connection, type ClientSession } from 'mongoose';
import { env } from '../common/env.js';
import { FILE_POLICY } from './file-policy.js';

interface QuotaAccount {
  _id: Types.ObjectId;
  disabled: boolean;
  quotaReady: boolean;
  quotaEntries: { operationId: string; bytes: number; state: string; expiresAt?: Date; trackId?: Types.ObjectId }[];
}
export function quotaAccounts(connection: Connection) { return connection.db!.collection<QuotaAccount>('users'); }

export const UPLOAD_RESERVE_BYTES = FILE_POLICY.maxAudioBytes + FILE_POLICY.maxCoverBytes;
export const UPLOAD_RESERVE_MS = 60 * 60_000;

export async function reserveAccountQuota(connection: Connection, ownerId: string, operationId: string) {
  const result = await quotaAccounts(connection).updateOne({ _id: new Types.ObjectId(ownerId), disabled: false, quotaReady: true,
    $expr: { $and: [
      { $lt: [{ $size: '$quotaEntries' }, env.accountQuotaTracks] },
      { $lte: [{ $add: [{ $sum: '$quotaEntries.bytes' }, UPLOAD_RESERVE_BYTES] }, env.accountQuotaBytes] },
    ] },
  }, { $push: { quotaEntries: { operationId, bytes: UPLOAD_RESERVE_BYTES, state: 'reserved',
    expiresAt: new Date(Date.now() + UPLOAD_RESERVE_MS) } } });
  if (!result.matchedCount) throw new HttpException('Account upload quota unavailable or exceeded', 429);
}

export async function commitAccountQuota(connection: Connection, ownerId: string, operationId: string,
  trackId: Types.ObjectId, bytes: number, session: ClientSession) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > UPLOAD_RESERVE_BYTES) throw new ServiceUnavailableException('Invalid upload quota size');
  const result = await quotaAccounts(connection).updateOne({ _id: new Types.ObjectId(ownerId), quotaReady: true,
    quotaEntries: { $elemMatch: { operationId, state: 'reserved', expiresAt: { $gt: new Date() } } },
  }, { $set: { 'quotaEntries.$.state': 'committed', 'quotaEntries.$.bytes': bytes, 'quotaEntries.$.trackId': trackId },
    $unset: { 'quotaEntries.$.expiresAt': '' } }, { session });
  if (result.matchedCount !== 1) throw new ServiceUnavailableException('Upload quota reservation expired');
}

export async function releaseAccountQuota(connection: Connection, operationId: string, session?: ClientSession) {
  await quotaAccounts(connection).updateOne({ 'quotaEntries.operationId': operationId },
    { $pull: { quotaEntries: { operationId, state: 'reserved' } } }, { session });
}
