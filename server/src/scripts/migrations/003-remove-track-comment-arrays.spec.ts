import { describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import type { MigrationJournalRecord } from '../lib/migration-journal.js';
import { removeTrackCommentArraysMigration as migration } from './003-remove-track-comment-arrays.js';

describe('comment array rollback evidence', () => {
  const beforeImage = { _id: 'track', lifecycle: 'active', commentWriteRevision: 0, comments: ['comment'] };
  const record = { collection: 'tracks', unset: ['comments'], beforeImage } as unknown as MigrationJournalRecord;
  const current = { _id: 'track', lifecycle: 'active', commentWriteRevision: 0 };

  it('allows restoration only for an otherwise unchanged track', async () => {
    expect(await migration.rollbackEvidence!({} as Db, record, current)).toBeNull();
    expect(await migration.rollbackEvidence!({} as Db, record, { ...current, commentWriteRevision: 1 }))
      .toBe('track-changed-after-contract-migration');
    expect(await migration.rollbackEvidence!({} as Db, record, { ...current, lifecycle: 'deleted' }))
      .toBe('track-changed-after-contract-migration');
  });
});
