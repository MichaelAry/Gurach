import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { assertIsolatedTestDatabase } from '../src/common/test-database.js';
import { MigrationRunner } from '../src/scripts/lib/migration-runner.js';
import { commentParentsMigration } from '../src/scripts/migrations/002-comment-parents.js';

import { removeTrackCommentArraysMigration as contract } from '../src/scripts/migrations/003-remove-track-comment-arrays.js';

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('MONGODB_URI is required for comment parent migration tests');
const databaseName = new URL(mongoUri).pathname.slice(1);
assertIsolatedTestDatabase(databaseName);

describe('002-comment-parents migration (isolated Mongo integration)', () => {
  let client: MongoClient;
  let rootClient: MongoClient | undefined;
  let db: Db;
  let backupDirectory: string | undefined;
  let restoredDatabaseName: string | undefined;
  const fixtureTrackIds: ObjectId[] = [];
  const fixtureCommentIds: ObjectId[] = [];
  const targetFingerprint = 'e'.repeat(64);

  beforeAll(async () => {
    client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    db = client.db(databaseName);
    if (process.env.MONGO_TEST_ROOT_URI) {
      rootClient = new MongoClient(process.env.MONGO_TEST_ROOT_URI, { serverSelectionTimeoutMS: 10_000 });
      await rootClient.connect();
    }
  });

  afterAll(async () => {
    if (db) {
      await db.collection('comments').deleteMany({ _id: { $in: fixtureCommentIds } });
      await db.collection('comment_quarantine').deleteMany({ originalId: { $in: fixtureCommentIds } });
      await db.collection('tracks').deleteMany({ _id: { $in: fixtureTrackIds } });
    }
    if (restoredDatabaseName?.startsWith('gurach_test_comment_restore_')) {
      await rootClient?.db(restoredDatabaseName).dropDatabase();
    }
    await rootClient?.close();
    await client?.close();
    if (backupDirectory?.startsWith(path.join(os.tmpdir(), 'gurach-comment-restore-'))) {
      await rm(backupDirectory, { recursive: true, force: true });
    }
  });

  it('classifies all links read-only, repairs only unique reverse links, and quarantines ambiguous rows reversibly', async () => {
    const [parentA, parentB, missingParent] = [new ObjectId(), new ObjectId(), new ObjectId()];
    const correct = new ObjectId();
    const repair = new ObjectId();
    const ambiguous = new ObjectId();
    const noParent = new ObjectId();
    const stringLink = new ObjectId();
    const dangling = new ObjectId();
    fixtureTrackIds.push(parentA, parentB);
    fixtureCommentIds.push(correct, repair, ambiguous, noParent, stringLink);
    const tracks = db.collection('tracks');
    const comments = db.collection('comments');
    await tracks.insertMany([
      { _id: parentA, name: 'parent A', comments: [correct, repair, ambiguous, dangling, 'malformed-reference'] },
      { _id: parentB, name: 'parent B', comments: [correct, ambiguous] },
    ]);
    await comments.insertMany([
      { _id: correct, track_id: parentA, username: 'a', text: 'authoritative link wins' },
      { _id: repair, track_id: missingParent, username: 'b', text: 'one reverse candidate' },
      { _id: ambiguous, username: 'c', text: 'two reverse candidates' },
      { _id: noParent, track_id: missingParent, username: 'd', text: 'no reverse candidate' },
      { _id: stringLink, track_id: parentA.toHexString(), username: 'e', text: 'canonical string link' },
    ]);

    if (process.env.MONGO_TEST_CONTAINER && process.env.MONGO_TEST_INTERNAL_ROOT_URI && rootClient) {
      backupDirectory = await mkdtemp(path.join(os.tmpdir(), 'gurach-comment-restore-'));
      await chmod(backupDirectory, 0o700);
      const runId = randomUUID();
      const configPath = path.join(backupDirectory, 'mongo-tools.yml');
      const containerConfig = `/tmp/gurach-comment-${runId}.yml`;
      const tracksArchive = `/tmp/gurach-comment-${runId}-tracks.archive`;
      const commentsArchive = `/tmp/gurach-comment-${runId}-comments.archive`;
      restoredDatabaseName = `gurach_test_comment_restore_${runId.replaceAll('-', '').slice(0, 20)}`;
      await writeFile(configPath, `uri: ${JSON.stringify(process.env.MONGO_TEST_INTERNAL_ROOT_URI)}\n`, { flag: 'wx', mode: 0o600 });
      const runDocker = (args: string[]) => {
        const result = spawnSync('docker', args, { stdio: 'ignore' });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`Isolated Mongo backup/restore command exited with ${result.status ?? 'unknown'}`);
      };
      const containerName = process.env.MONGO_TEST_CONTAINER;
      runDocker(['cp', configPath, `${containerName}:${containerConfig}`]);
      runDocker(['exec', containerName, 'mongodump', `--config=${containerConfig}`, `--db=${databaseName}`, '--collection=tracks', `--archive=${tracksArchive}`]);
      runDocker(['exec', containerName, 'mongodump', `--config=${containerConfig}`, `--db=${databaseName}`, '--collection=comments', `--archive=${commentsArchive}`]);
      runDocker(['exec', containerName, 'mongorestore', `--config=${containerConfig}`, `--archive=${tracksArchive}`, `--nsFrom=${databaseName}.tracks`, `--nsTo=${restoredDatabaseName}.tracks`]);
      runDocker(['exec', containerName, 'mongorestore', `--config=${containerConfig}`, `--archive=${commentsArchive}`, `--nsFrom=${databaseName}.comments`, `--nsTo=${restoredDatabaseName}.comments`]);
      const restoredDb = rootClient.db(restoredDatabaseName);
      expect(await restoredDb.collection('tracks').countDocuments({ _id: { $in: fixtureTrackIds } })).toBe(2);
      expect(await restoredDb.collection('comments').countDocuments({ _id: { $in: fixtureCommentIds } })).toBe(5);
      const restoredUnknownTimestamp = await restoredDb.collection('comments').findOne({ _id: noParent });
      expect(restoredUnknownTimestamp).not.toHaveProperty('createdAt');
      expect(restoredUnknownTimestamp).not.toHaveProperty('updatedAt');
      expect(restoredUnknownTimestamp).toMatchObject({ text: 'no reverse candidate', username: 'd' });
    }

    const runner = new MigrationRunner(db);
    const dryRun = await runner.plan(commentParentsMigration, { batchSize: 2 });
    expect(dryRun.planned).toBe(4);
    expect(dryRun.audit).toMatchObject({
      commentCount: 5,
      counts: {
        authoritative_reverse_disagreement: 1,
        normalize_string_link: 1,
        repair_from_single_reverse: 1,
        unresolved_multiple_reverse: 1,
        unresolved_no_parent: 1,
      },
    });
    expect((dryRun.audit?.reverseCounts as Record<string, number>)).toMatchObject({ linked: 5, dangling: 1, malformed: 1 });
    expect(await comments.findOne({ _id: repair })).toMatchObject({ track_id: missingParent });
    expect(await comments.findOne({ _id: ambiguous })).not.toHaveProperty('migrationQuarantineId');
    expect(await db.listCollections({ name: 'comment_quarantine' }).hasNext()).toBe(false);

    await expect(runner.apply(commentParentsMigration, {
      targetFingerprint,
      batchSize: 2,
      afterRecordApplied: async (count) => {
        if (count === 1) throw new Error('simulated migration interruption after a journaled comment change');
      },
    })).rejects.toThrow(/simulated migration interruption/);
    expect(await db.collection('comments').countDocuments({ _id: { $in: fixtureCommentIds } })).toBe(5);
    expect(await db.collection('_gurach_migration_journal').countDocuments({
      migrationId: commentParentsMigration.id,
      outcome: 'applied',
      sourceId: { $in: fixtureCommentIds },
    })).toBe(1);

    const applied = await runner.apply(commentParentsMigration, { targetFingerprint, batchSize: 2 });
    expect(applied.applied).toBe(3);
    expect(await db.collection('comments').countDocuments({ _id: { $in: fixtureCommentIds } })).toBe(5);
    expect(await comments.findOne({ _id: correct })).toMatchObject({ track_id: parentA, text: 'authoritative link wins' });
    expect(await comments.findOne({ _id: repair })).toMatchObject({ track_id: parentA, text: 'one reverse candidate' });
    expect(await comments.findOne({ _id: stringLink })).toMatchObject({ track_id: parentA });
    expect(await comments.findOne({ _id: ambiguous })).toMatchObject({
      migrationQuarantineId: commentParentsMigration.id,
      migrationQuarantineReason: 'unresolved_multiple_reverse',
      text: 'two reverse candidates',
    });
    expect(await comments.findOne({ _id: noParent })).toMatchObject({
      migrationQuarantineId: commentParentsMigration.id,
      migrationQuarantineReason: 'unresolved_no_parent',
      text: 'no reverse candidate',
    });
    const copies = await db.collection('comment_quarantine').find({ originalId: { $in: [ambiguous, noParent] } }).toArray();
    expect(copies).toHaveLength(2);
    expect(copies.map((row) => row.beforeImage.text).sort((a, b) => a.localeCompare(b))).toEqual(['no reverse candidate', 'two reverse candidates']);
    expect(copies.every((row) => typeof row.checksum === 'string' && row.migrationId === commentParentsMigration.id)).toBe(true);

    const verification = await runner.verify(commentParentsMigration, { targetFingerprint, batchSize: 10 });
    expect(verification.issueCount).toBe(0);
    expect((await comments.listIndexes().toArray()).some((index) => index.name === 'comment_track_id_id')).toBe(true);
    const secondPass = await runner.apply(commentParentsMigration, { targetFingerprint, batchSize: 2 });
    expect(secondPass).toMatchObject({ planned: 0, applied: 0, resumed: 0 });
  }, 30_000);
  it('rehearses contract interruption, resume, no-op and restoration', async () => {
    const runner = new MigrationRunner(db);
    const before = await db.collection('tracks').find({ comments: { $exists: true } }).sort({ _id: 1 }).toArray();
    const commentsBefore = await db.collection('comments').find().sort({ _id: 1 }).toArray();
    const options = { targetFingerprint, batchSize: 1 };
    await expect(runner.apply(contract, { ...options, afterCompareAndSet: async () => {
      throw new Error('contract interruption');
    } })).rejects.toThrow('contract interruption');
    await runner.apply(contract, options);
    expect((await runner.verify(contract, options)).issueCount).toBe(0);
    expect(await db.collection('comments').find().sort({ _id: 1 }).toArray()).toEqual(commentsBefore);
    expect(await runner.apply(contract, options)).toMatchObject({ planned: 0, applied: 0, resumed: 0 });
    expect((await runner.rollback(contract, { ...options, dryRun: true })).eligible).toBe(before.length);
    await runner.rollback(contract, { ...options, dryRun: false });
    expect(await db.collection('tracks').find({ _id: { $in: before.map((row) => row._id) } }).sort({ _id: 1 }).toArray()).toEqual(before);
  });

});
