import { ObjectId } from 'mongodb';
import { isDeepStrictEqual } from 'node:util';
import type { MigrationDefinition } from '../lib/migration-runner.js';
import { commentParentsMigration } from './002-comment-parents.js';

/** Apply only with all application, seed and maintenance writers stopped. */
export const removeTrackCommentArraysMigration: MigrationDefinition = {
  id: '003-remove-track-comment-arrays',
  version: 1,
  description: 'Remove legacy track comment arrays after parent reconciliation',
  async rollbackEvidence(_db, record, current) {
    if (record.collection !== 'tracks' || record.unset.length !== 1 || record.unset[0] !== 'comments') return 'unexpected-before-image';
    const expected = { ...record.beforeImage };
    delete expected.comments;
    return isDeepStrictEqual(current, expected) ? null : 'track-changed-after-contract-migration';
  },
  async planBatch({ db, afterCheckpoint, limit }) {
    const reconciliation = await commentParentsMigration.verify(db, limit);
    if (reconciliation.issueCount !== 0) throw new Error('Comment parent reconciliation must pass before removing reverse arrays');
    const rows = await db.collection('tracks').find({
      comments: { $exists: true },
      ...(afterCheckpoint ? { _id: { $gt: new ObjectId(afterCheckpoint) } } : {}),
    }).sort({ _id: 1 }).limit(limit).toArray();
    return rows.map((row) => ({
      collection: 'tracks', rowId: String(row._id), sourceId: row._id,
      checkpoint: String(row._id), expectedOld: { comments: row.comments },
      beforeImage: row, set: {}, unset: ['comments'],
    }));
  },
  async verify(db, batchSize) {
    const parents = await commentParentsMigration.verify(db, batchSize);
    const remaining = await db.collection('tracks').countDocuments({ comments: { $exists: true } });
    return { checked: parents.checked, issueCount: parents.issueCount + remaining };
  },
};
