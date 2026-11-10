import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { assertIsolatedTestDatabase } from '../src/common/test-database.js';
import type { MigrationJournalRecord } from '../src/scripts/lib/migration-journal.js';
import { MigrationRunner } from '../src/scripts/lib/migration-runner.js';
import { trackLifecycleMigration } from '../src/scripts/migrations/001-track-lifecycle.js';
import { env } from '../src/common/env.js';

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('MONGODB_URI is required for lifecycle migration integration tests');
const databaseName = new URL(mongoUri).pathname.slice(1);
assertIsolatedTestDatabase(databaseName);

describe('001-track-lifecycle migration (isolated Mongo integration)', () => {
  let client: MongoClient;
  let db: Db;
  const fixtureIds: ObjectId[] = [];
  const mediaFixturePaths: string[] = [];
  const targetFingerprint = 'd'.repeat(64);

  beforeAll(async () => {
    client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    db = client.db(databaseName);
  });

  afterAll(async () => {
    if (db && fixtureIds.length > 0) {
      await db.collection('tracks').deleteMany({ _id: { $in: fixtureIds } });
    }
    await Promise.all(mediaFixturePaths.map((filePath) => unlink(filePath).catch(() => undefined)));
    await client?.close();
  });

  it('backfills only missing lifecycle, preserves references, resumes safely, installs indexes and is a no-op on repeat', async () => {
    const missingAudioId = new ObjectId();
    const deletedId = new ObjectId();
    const rollbackId = new ObjectId();
    const deletedAfterMigrationId = new ObjectId();
    fixtureIds.push(missingAudioId, deletedId, rollbackId, deletedAfterMigrationId);
    const rollbackAudio = `${randomUUID()}.mp3`;
    const rollbackPicture = `${randomUUID()}.jpg`;
    await Promise.all(['audio', 'picture'].map((kind) => mkdir(path.join(env.staticDir, kind), { recursive: true })));
    for (const [kind, key] of [['audio', rollbackAudio], ['picture', rollbackPicture]] as const) {
      const filePath = path.join(env.staticDir, kind, key);
      await writeFile(filePath, Buffer.from(`rollback evidence ${key}`), { flag: 'wx', mode: 0o600 });
      mediaFixturePaths.push(filePath);
    }
    const tracks = db.collection('tracks');
    await tracks.insertMany([
      { _id: missingAudioId, name: 'legacy without audio', picture: 'legacy-cover.png', comments: [], listens: 3 },
      { _id: deletedId, name: 'already deleted', audio: 'kept.mp3', picture: 'kept.jpg', lifecycle: 'deleted' },
      { _id: rollbackId, name: 'rollback with files', audio: rollbackAudio, picture: rollbackPicture },
      { _id: deletedAfterMigrationId, name: 'do not reactivate', audio: rollbackAudio, picture: rollbackPicture },
    ]);
    const deletedFixtures = Array.from({ length: 250 }, () => ({
      _id: new ObjectId(),
      name: 'deleted fixture',
      lifecycle: 'deleted',
    }));
    fixtureIds.push(...deletedFixtures.map(({ _id }) => _id));
    await tracks.insertMany(deletedFixtures);

    const runner = new MigrationRunner(db);
    const dryRun = await runner.plan(trackLifecycleMigration, { batchSize: 1 });
    expect(dryRun.planned).toBeGreaterThanOrEqual(1);
    expect(await tracks.findOne({ _id: missingAudioId })).not.toHaveProperty('lifecycle');

    await expect(runner.apply(trackLifecycleMigration, {
      targetFingerprint,
      batchSize: 1,
      afterCompareAndSet: async (count) => {
        if (count === 1) throw new Error('simulated interruption after lifecycle CAS');
      },
    })).rejects.toThrow('simulated interruption after lifecycle CAS');

    const resumed = await runner.apply(trackLifecycleMigration, { targetFingerprint, batchSize: 1 });
    expect(resumed.applied + resumed.resumed).toBeGreaterThanOrEqual(1);

    const migrated = await tracks.findOne({ _id: missingAudioId });
    expect(migrated).toMatchObject({
      _id: missingAudioId,
      lifecycle: 'active',
      name: 'legacy without audio',
      picture: 'legacy-cover.png',
      comments: [],
      listens: 3,
    });
    expect(migrated).not.toHaveProperty('audio');
    expect(await tracks.findOne({ _id: deletedId })).toMatchObject({ lifecycle: 'deleted', audio: 'kept.mp3' });

    const journal = await db.collection<MigrationJournalRecord>('_gurach_migration_journal')
      .findOne({ migrationId: trackLifecycleMigration.id, sourceId: missingAudioId });
    expect(journal?.beforeImage).not.toHaveProperty('audio');
    expect(journal?.beforeImage).not.toHaveProperty('lifecycle');

    const verification = await runner.verify(trackLifecycleMigration, { targetFingerprint, batchSize: 10 });
    expect(verification.issueCount).toBe(0);
    const indexes = await tracks.listIndexes().toArray();
    expect(indexes.some((index) => index.name === 'track_lifecycle_id')).toBe(true);

    const explained = await tracks.find({ lifecycle: 'active' }).sort({ _id: 1 }).explain('queryPlanner');
    expect(JSON.stringify(explained.queryPlanner.winningPlan)).toContain('track_lifecycle_id');

    const secondPass = await runner.apply(trackLifecycleMigration, { targetFingerprint, batchSize: 1 });
    expect(secondPass).toMatchObject({ planned: 0, applied: 0, resumed: 0 });

    await tracks.updateOne({ _id: deletedAfterMigrationId }, { $set: { lifecycle: 'deleted' } });
    const rollbackPreview = await runner.rollback(trackLifecycleMigration, { targetFingerprint, batchSize: 10, dryRun: true });
    expect(rollbackPreview.eligible).toBe(1);
    expect(rollbackPreview.skipReasons['track-no-longer-active']).toBe(1);
    expect(await tracks.findOne({ _id: rollbackId })).toHaveProperty('lifecycle', 'active');
    const rolledBack = await runner.rollback(trackLifecycleMigration, { targetFingerprint, batchSize: 10, dryRun: false });
    expect(rolledBack).toMatchObject({ eligible: 1, restored: 1 });
    expect(await tracks.findOne({ _id: rollbackId })).not.toHaveProperty('lifecycle');
    expect(await tracks.findOne({ _id: deletedAfterMigrationId })).toHaveProperty('lifecycle', 'deleted');
    await expect(runner.rollback(trackLifecycleMigration, { targetFingerprint, batchSize: 10, dryRun: true })).rejects.toThrow('Only a completed migration can be rolled back');
  });
});
