import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectId, MongoClient, type Db, type Document } from 'mongodb';
import { assertIsolatedTestDatabase } from '../src/common/test-database.js';
import {
  MigrationRunner,
  type MigrationDefinition,
} from '../src/scripts/lib/migration-runner.js';
import type { MigrationState, MigrationJournalRecord } from '../src/scripts/lib/migration-journal.js';

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('MONGODB_URI is required for migration integration tests');
const databaseName = new URL(mongoUri).pathname.slice(1);
assertIsolatedTestDatabase(databaseName);

describe('resumable migration framework (isolated Mongo integration)', () => {
  let client: MongoClient;
  let db: Db;
  let fixtureCollection: string;

  beforeAll(async () => {
    client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    db = client.db(databaseName);
    fixtureCollection = `migration_framework_${new ObjectId().toHexString()}`;
  });

  afterAll(async () => {
    if (db && fixtureCollection) await db.collection(fixtureCollection).drop().catch(() => undefined);
    await client?.close();
  });

  it('dry-runs without writes, resumes a journaled CAS after interruption, verifies and reruns as a no-op', async () => {
    const migrationId = 'p36-resume-test';
    const docs = await db.collection(fixtureCollection).insertMany([
      { value: 1 }, { value: 2 }, { value: 3 },
    ]);
    const migration = setFieldMigration(migrationId, fixtureCollection);
    const fingerprint = 'a'.repeat(64);
    const runner = new MigrationRunner(db);

    const preview = await runner.plan(migration, { batchSize: 2 });
    expect(preview.planned).toBe(3);
    expect(await db.collection(fixtureCollection).countDocuments({ lifecycle: { $exists: true } })).toBe(0);
    expect(await db.collection<MigrationState>('_gurach_migration_state').countDocuments({ _id: migrationId })).toBe(0);
    expect(await db.collection<MigrationJournalRecord>('_gurach_migration_journal').countDocuments({ migrationId })).toBe(0);

    await expect(runner.apply(migration, {
      targetFingerprint: fingerprint,
      batchSize: 2,
      afterCompareAndSet: async (count) => {
        if (count === 1) throw new Error('simulated process interruption');
      },
    })).rejects.toThrow('simulated process interruption');

    const first = await db.collection(fixtureCollection).findOne({ _id: docs.insertedIds[0] });
    expect(first?.lifecycle).toBe('active');
    expect(await db.collection<MigrationJournalRecord>('_gurach_migration_journal').countDocuments({ migrationId, outcome: 'planned' })).toBe(1);
    expect((await db.collection<MigrationState>('_gurach_migration_state').findOne({ _id: migrationId }))?.lastCheckpoint).toBeNull();

    const resumed = await runner.apply(migration, { targetFingerprint: fingerprint, batchSize: 2 });
    expect(resumed.applied).toBe(2);
    expect(resumed.resumed).toBe(1);
    expect(await db.collection(fixtureCollection).countDocuments({ lifecycle: 'active' })).toBe(3);

    const verified = await runner.verify(migration, { targetFingerprint: fingerprint, batchSize: 2 });
    expect(verified).toMatchObject({ checked: 3, journalChecked: 3, issueCount: 0 });
    await expect(runner.verify(migration, {
      targetFingerprint: 'b'.repeat(64),
      batchSize: 2,
    })).rejects.toThrow(/different target/);

    const secondPass = await runner.apply(migration, { targetFingerprint: fingerprint, batchSize: 2 });
    expect(secondPass).toMatchObject({ planned: 0, applied: 0, resumed: 0 });
    await expect(runner.apply(migration, {
      targetFingerprint: fingerprint,
      batchSize: 2,
      checkpoint: 'START',
    })).rejects.toThrow(/does not match the stored migration checkpoint/);
    await db.collection(fixtureCollection).updateOne({ _id: docs.insertedIds[0] }, { $set: { lifecycle: 'changed-out-of-band' } });
    await expect(runner.apply(migration, { targetFingerprint: fingerprint, batchSize: 2 }))
      .rejects.toThrow(/already-applied migration record no longer matches/);
  });

  it('journals and refuses compare-and-set conflicts without changing the source record', async () => {
    const migrationId = 'p36-conflict-test';
    const inserted = await db.collection(fixtureCollection).insertOne({ value: 8 });
    const migration = setFieldMigration(migrationId, fixtureCollection, { value: -1 });
    const runner = new MigrationRunner(db);
    await expect(runner.apply(migration, {
      targetFingerprint: 'c'.repeat(64),
      batchSize: 1,
    })).rejects.toThrow(/expected old values/);

    const source = await db.collection(fixtureCollection).findOne({ _id: inserted.insertedId });
    expect(source).toMatchObject({ value: 8 });
    expect(source).not.toHaveProperty('lifecycle');
    expect(await db.collection<MigrationJournalRecord>('_gurach_migration_journal').countDocuments({ migrationId, outcome: 'conflict' })).toBe(1);
  });
});

function setFieldMigration(
  id: string,
  collection: string,
  expectedOverrides: Record<string, unknown> = {},
): MigrationDefinition {
  return {
    id,
    version: 1,
    description: 'Set lifecycle on isolated migration fixtures',
    async planBatch({ db, afterCheckpoint, limit }) {
      const filter: Document = {
        lifecycle: { $exists: false },
        ...(afterCheckpoint ? { _id: { $gt: new ObjectId(afterCheckpoint) } } : {}),
      };
      const records = await db.collection(collection).find(filter).sort({ _id: 1 }).limit(limit).toArray();
      return records.map((record) => ({
        collection,
        rowId: String(record._id),
        sourceId: record._id,
        checkpoint: String(record._id),
        expectedOld: { lifecycle: { $exists: false }, value: expectedOverrides.value ?? record.value },
        beforeImage: record,
        set: { lifecycle: 'active' },
      }));
    },
    async verify(db, batchSize) {
      const total = await db.collection(collection).countDocuments();
      const issues = await db.collection(collection).countDocuments({ lifecycle: { $ne: 'active' } });
      return { checked: Math.min(total, batchSize) + Math.max(total - batchSize, 0), issueCount: issues };
    },
  };
}
