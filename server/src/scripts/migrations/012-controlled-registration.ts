import { ObjectId, type Db } from 'mongodb';
import { isDeepStrictEqual } from 'node:util';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../common/env.js';
import type { MigrationDefinition } from '../lib/migration-runner.js';

const indexes = [
  { collection: 'users', key: { 'quotaEntries.expiresAt': 1 }, name: 'account_quota_expiry' },
  { collection: 'tracks', key: { audio: 1, lifecycle: 1 }, name: 'track_audio_access' },
  { collection: 'tracks', key: { picture: 1, lifecycle: 1 }, name: 'track_picture_access' },
  { collection: 'recoverytokens', key: { tokenHash: 1 }, name: 'recovery_token_unique', unique: true },
  { collection: 'recoverytokens', key: { userId: 1, purpose: 1 }, name: 'recovery_user_purpose_unique', unique: true },
  { collection: 'recoverytokens', key: { expiresAt: 1 }, name: 'recovery_expiry', expireAfterSeconds: 0 },
  { collection: 'trackreports', key: { trackId: 1, reporterId: 1 }, name: 'track_report_actor_unique', unique: true },
  { collection: 'trackreports', key: { state: 1, _id: -1 }, name: 'track_report_review' },
] as const;

async function entriesFor(db: Db, ownerId: ObjectId) {
  const entries = [];
  const tracks = db.collection('tracks').find({ ownerId, lifecycle: { $in: ['active', 'deleting'] } }).sort({ _id: 1 });
  for await (const track of tracks) {
    let bytes = 0;
    for (const field of ['audio', 'picture']) {
      const key: unknown = track[field];
      if (!key && field === 'picture') continue;
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(key) || key.includes('..')) throw new Error('Unsafe legacy media key; reconcile before quota backfill');
      const stat = await lstat(path.join(env.staticDir, field, key));
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Quota backfill requires regular media files');
      bytes += stat.size;
    }
    const upload = await db.collection('mediaoperations').findOne({ trackId: track._id, kind: 'upload', result: 'published', upload: { $exists: true } });
    if (upload) {
      if (typeof upload.operationId !== 'string' || !/^[a-f0-9-]{36}$/i.test(upload.operationId)) throw new Error('Unsafe private media operation');
      for (const file of ['audio.upload', 'picture.upload']) {
        const stat = await lstat(path.join(env.mediaStagingDir, upload.operationId, file));
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Quota verification requires private originals');
        bytes += stat.size;
      }
    }
    entries.push({ operationId: upload?.operationId ?? `legacy:${String(track._id)}`, trackId: track._id, bytes, state: 'committed' });
  }
  return entries;
}

export const controlledRegistrationMigration: MigrationDefinition = {
  id: '012-controlled-registration', version: 1,
  description: 'Backfill per-account media usage and install recovery and moderation indexes; writers must be stopped',
  privateAudit: true,
  async planBatch({ db, afterCheckpoint, limit }) {
    if (await db.collection('mediaoperations').countDocuments({ kind: 'upload', state: { $ne: 'done' } })) throw new Error('Reconcile unfinished uploads before quota migration');
    const rows = await db.collection('users').find(afterCheckpoint ? { _id: { $gt: new ObjectId(afterCheckpoint) } } : {}).sort({ _id: 1 }).limit(limit).toArray();
    return Promise.all(rows.map(async (row) => ({
      collection: 'users', rowId: String(row._id), sourceId: row._id, checkpoint: String(row._id),
      expectedOld: { quotaReady: row.quotaReady ?? { $exists: false }, quotaEntries: row.quotaEntries ?? { $exists: false } },
      beforeImage: row, set: { quotaReady: true, quotaEntries: await entriesFor(db, row._id) },
    })));
  },
  async finalize(db) {
    for (const { collection, key, ...options } of indexes) await db.collection(collection).createIndex(key, options);
  },
  async verify(db) {
    let checked = 0;
    let issueCount = 0;
    for await (const user of db.collection('users').find()) {
      checked += 1;
      if (user.quotaReady !== true || !isDeepStrictEqual(usage(user.quotaEntries ?? []), usage(await entriesFor(db, user._id)))) issueCount += 1;
    }
    issueCount += await verifyPlatformIndexes(db);
    checked += indexes.length;
    return { checked, issueCount };
  },
  async rollbackEvidence(_db, record, current) {
    return isDeepStrictEqual(current.quotaEntries, record.set.quotaEntries) && current.quotaReady === true
      ? null : 'quota-changed-after-backfill';
  },
};

function usage(entries: { state: string; trackId?: ObjectId; bytes: number }[]) {
  return entries.filter((entry) => entry.state === 'committed').map((entry) => ({ trackId: String(entry.trackId), bytes: entry.bytes }))
    .sort((a, b) => a.trackId.localeCompare(b.trackId));
}
export async function verifyPlatformIndexes(db: Db): Promise<number> {
  let issueCount = 0;
  for (const { collection, key, ...expected } of indexes) {
    const exists = await db.listCollections({ name: collection }).hasNext();
    const actual = exists ? await db.collection(collection).listIndexes().toArray() : [];
    if (!actual.some((index) => index.name === expected.name && isDeepStrictEqual(index.key, key)
      && Boolean(index.unique) === ('unique' in expected) && index.expireAfterSeconds === ('expireAfterSeconds' in expected ? 0 : undefined)
      && !index.sparse && !index.partialFilterExpression && !index.collation)) issueCount += 1;
  }
  return issueCount;
}
