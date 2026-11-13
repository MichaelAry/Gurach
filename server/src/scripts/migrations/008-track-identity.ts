import { ObjectId, type Db, type Document } from 'mongodb';
import { normalizeTrackIdentity } from '../../track/track-identity.js';
import { isTrackIdentityIndex, TRACK_IDENTITY_INDEX, TRACK_IDENTITY_KEYS, TRACK_IDENTITY_PARTIAL } from '../../track/schemas/track.schema.js';
import type { MigrationDefinition } from '../lib/migration-runner.js';

async function inspect(db: Db) {
  const groups = new Map<string, string[]>();
  let checked = 0;
  let missingOrStale = 0;
  for await (const row of db.collection('tracks').find({ lifecycle: 'active' }).project({ name: 1, artist: 1, nameKey: 1, artistKey: 1 })) {
    checked += 1;
    const nameKey = normalizeTrackIdentity(row.name as string | undefined);
    const artistKey = normalizeTrackIdentity(row.artist as string | undefined);
    if (row.nameKey !== nameKey || row.artistKey !== artistKey) missingOrStale += 1;
    const key = JSON.stringify([nameKey, artistKey]);
    const ids = groups.get(key) ?? [];
    ids.push(String(row._id));
    groups.set(key, ids);
  }
  const duplicates = [...groups].filter(([, ids]) => ids.length > 1)
    .map(([pair, trackIds]) => ({ pair: JSON.parse(pair) as string[], trackIds }));
  return { checked, missingOrStale, duplicates };
}
async function assertNoDuplicates(db: Db) {
  const report = await inspect(db);
  if (report.duplicates.length) throw new Error(`Active track duplicates require operator resolution; no tracks were deleted or hidden: ${JSON.stringify(report.duplicates)}`);
}

/** Stop application, seed and maintenance writers for plan/apply/verify.
 * Duplicate groups block backfill without deleting or hiding tracks.
 * A partial run does NOT provide full catalogue protection.
 */
export const trackIdentityMigration: MigrationDefinition = {
  id: '008-track-identity', version: 1,
  description: 'Report active duplicate pairs, backfill comparison keys, install the explicit unique index',
  async audit(db) { return inspect(db); },
  async planBatch({ db, afterCheckpoint, limit }) {
    // Check on resume too, before making any further catalogue changes.
    await assertNoDuplicates(db);
    const rows = await db.collection('tracks').find({
      lifecycle: 'active', ...(afterCheckpoint ? { _id: { $gt: new ObjectId(afterCheckpoint) } } : {}),
    }).sort({ _id: 1 }).limit(limit).toArray();
    return rows.map((row) => {
      const expectedOld: Document = { lifecycle: 'active' };
      for (const key of ['name', 'artist', 'nameKey', 'artistKey']) expectedOld[key] = Object.hasOwn(row, key) ? row[key] : { $exists: false };
      return {
        collection: 'tracks', rowId: String(row._id), sourceId: row._id,
        checkpoint: String(row._id), expectedOld, beforeImage: row,
        set: { nameKey: normalizeTrackIdentity(row.name as string | undefined), artistKey: normalizeTrackIdentity(row.artist as string | undefined) },
      };
    });
  },
  async finalize(db) {
    await assertNoDuplicates(db);
    if ((await inspect(db)).missingOrStale) throw new Error('Incomplete track identity backfill; unique index would not protect the full catalogue');
    await db.collection('tracks').createIndex(TRACK_IDENTITY_KEYS, {
      name: TRACK_IDENTITY_INDEX, unique: true, partialFilterExpression: TRACK_IDENTITY_PARTIAL,
    });
  },
  async verify(db) {
    const report = await inspect(db);
    const exists = await db.listCollections({ name: 'tracks' }).hasNext();
    const indexes = exists ? await db.collection('tracks').listIndexes().toArray() : [];
    return { checked: report.checked, issueCount: report.missingOrStale + report.duplicates.length + (indexes.some(isTrackIdentityIndex) ? 0 : 1) };
  },
};
