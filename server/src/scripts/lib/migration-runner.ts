import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Db, Document, Filter, UpdateFilter } from 'mongodb';
import {
  MigrationJournal,
  type MigrationJournalRecord,
} from './migration-journal.js';

export interface MigrationChange {
  collection: string;
  rowId: string;
  sourceId: unknown;
  checkpoint: string;
  expectedOld: Record<string, unknown>;
  beforeImage: Document;
  set: Record<string, unknown>;
  unset?: string[];
}

export interface MigrationBatchContext {
  db: Db;
  afterCheckpoint: string | null;
  limit: number;
}

export interface MigrationVerification {
  checked: number;
  issueCount: number;
  journalChecked?: number;
  checksum?: string;
}

export interface MigrationDefinition {
  id: string;
  version: number;
  description: string;
  planBatch(context: MigrationBatchContext): Promise<MigrationChange[]>;
  verify(db: Db, batchSize: number): Promise<MigrationVerification>;
  /** Idempotent DDL run under the migration lease before the migration is marked complete. */
  finalize?(db: Db): Promise<void>;
  /** Explicit evidence gate for restoring before-images through db:migrate:rollback. */
  rollbackEvidence?(db: Db, record: MigrationJournalRecord, current: Document): Promise<string | null>;
  /** Private classification summary included in read-only migration plans. */
  audit?(db: Db): Promise<Record<string, unknown>>;
  /** Require the detailed audit to be written only to an owner-only report path. */
  privateAudit?: boolean;
}

export interface MigrationPlanSummary {
  migrationId: string;
  migrationVersion: number;
  planned: number;
  finalCheckpoint: string | null;
  checksum: string;
}

export interface MigrationRunOptions {
  targetFingerprint: string;
  batchSize: number;
  checkpoint?: string;
  dryRun?: boolean;
  /** Fault injection hook used by isolated integration tests. */
  afterRecordApplied?: (count: number) => Promise<void>;
  /** Simulates a process stop after Mongo CAS but before journal/checkpoint writes. */
  afterCompareAndSet?: (count: number) => Promise<void>;
}

const MIGRATION_COLLECTIONS = new Set([
  '_gurach_migration_state',
  '_gurach_migration_journal',
]);
const LOCK_LEASE_MS = 60_000;

export class MigrationRunner {
  private readonly journal: MigrationJournal;

  constructor(private readonly db: Db) {
    this.journal = new MigrationJournal(db);
  }

  async plan(
    migration: MigrationDefinition,
    options: Pick<MigrationRunOptions, 'batchSize' | 'checkpoint'>,
  ): Promise<MigrationPlanSummary & { audit?: Record<string, unknown> }> {
    validateDefinition(migration);
    const accumulator = createHash('sha256');
    let afterCheckpoint = options.checkpoint === 'START' ? null : options.checkpoint ?? null;
    let planned = 0;
    for (;;) {
      const batch = await migration.planBatch({ db: this.db, afterCheckpoint, limit: options.batchSize });
      this.validateBatch(batch, afterCheckpoint, options.batchSize);
      if (batch.length === 0) break;
      for (const change of batch) {
        accumulator.update(stableChangeHashInput(change));
        accumulator.update('\n');
        afterCheckpoint = change.checkpoint;
        planned += 1;
      }
    }
    return {
      migrationId: migration.id,
      migrationVersion: migration.version,
      planned,
      finalCheckpoint: afterCheckpoint,
      checksum: accumulator.digest('hex'),
      ...(migration.audit ? { audit: await migration.audit(this.db) } : {}),
    };
  }

  async apply(
    migration: MigrationDefinition,
    options: MigrationRunOptions,
  ): Promise<MigrationPlanSummary & { applied: number; resumed: number }> {
    validateDefinition(migration);
    if (options.dryRun) return { ...(await this.plan(migration, options)), applied: 0, resumed: 0 };
    let state = await this.journal.getState(migration.id);
    if (state?.status === 'rolledBack') throw new Error('This migration was rolled back and cannot be reapplied from its existing journal');
    if (!state && options.checkpoint !== undefined && options.checkpoint !== 'START') {
      throw new Error('Requested checkpoint does not match the initial migration checkpoint');
    }
    if (state && options.checkpoint !== undefined && options.checkpoint !== (state.lastCheckpoint ?? 'START')) {
      throw new Error('Requested checkpoint does not match the stored migration checkpoint');
    }
    await this.journal.ensureIndexes();
    state = await this.journal.initializeState(
      migration.id,
      migration.version,
      options.targetFingerprint,
    );

    const runId = randomUUID();
    await this.journal.acquireLock(migration.id, runId, LOCK_LEASE_MS);
    const accumulator = createHash('sha256');
    let applied = 0;
    let resumed = 0;
    let planned = 0;
    let compareAndSets = 0;
    try {
      state = (await this.journal.getState(migration.id))!;
      await this.verifyAppliedJournal(migration.id, options.targetFingerprint, options.batchSize);
      for (;;) {
        await this.journal.renewLock(migration.id, runId, LOCK_LEASE_MS);

        // Reconcile a write whose process stopped after Mongo accepted the CAS
        // but before its journal outcome/checkpoint was advanced.
        const pending = await this.journal.getPendingRecords(
          migration.id,
          options.targetFingerprint,
          state.lastCheckpoint,
          options.batchSize,
        );
        if (pending.length > 0) {
          for (const record of pending) {
            await this.journal.renewLock(migration.id, runId, LOCK_LEASE_MS);
            await this.applyJournalRecord(record, runId, state);
            state = (await this.journal.getState(migration.id))!;
            resumed += 1;
          }
          continue;
        }

        const batch = await migration.planBatch({
          db: this.db,
          afterCheckpoint: state.lastCheckpoint,
          limit: options.batchSize,
        });
        this.validateBatch(batch, state.lastCheckpoint, options.batchSize);
        if (batch.length === 0) break;

        for (const change of batch) {
          await this.journal.renewLock(migration.id, runId, LOCK_LEASE_MS);
          const recordId = journalRecordId(migration.id, change.rowId);
          const record = await this.journal.createRecord({
            _id: recordId,
            migrationId: migration.id,
            migrationVersion: migration.version,
            targetFingerprint: options.targetFingerprint,
            rowId: change.rowId,
            collection: change.collection,
            sourceId: change.sourceId,
            checkpoint: change.checkpoint,
            expectedOld: change.expectedOld,
            beforeImage: change.beforeImage,
            set: change.set,
            unset: change.unset ?? [],
            outcome: 'planned',
          });
          if (record.outcome === 'conflict') throw new Error('Migration encountered a previously journaled conflict');
          const wasAlreadyApplied = record.outcome === 'applied';
          await this.applyJournalRecord(record, runId, state, async () => {
            compareAndSets += 1;
            await options.afterCompareAndSet?.(compareAndSets);
          });
          state = (await this.journal.getState(migration.id))!;
          accumulator.update(stableChangeHashInput(change));
          accumulator.update('\n');
          planned += 1;
          if (wasAlreadyApplied) resumed += 1;
          else applied += 1;
          await options.afterRecordApplied?.(applied + resumed);
        }
      }
      state = (await this.journal.getState(migration.id))!;
      await migration.finalize?.(this.db);
      await this.journal.complete(migration.id, runId, state.lastCheckpoint);
      return {
        migrationId: migration.id,
        migrationVersion: migration.version,
        planned,
        finalCheckpoint: state.lastCheckpoint,
        checksum: accumulator.digest('hex'),
        applied,
        resumed,
      };
    } finally {
      await this.journal.releaseLock(migration.id, runId);
    }
  }

  async verify(
    migration: MigrationDefinition,
    options: { targetFingerprint: string; batchSize: number; checkpoint?: string },
  ): Promise<MigrationVerification> {
    validateDefinition(migration);
    const state = await this.journal.getState(migration.id);
    if (state?.status === 'rolledBack') throw new Error('Migration is rolled back; apply it again only through a fresh migration journal');
    if (!state && options.checkpoint !== undefined && options.checkpoint !== 'START') {
      throw new Error('Requested checkpoint does not match the initial migration checkpoint');
    }
    if (state) {
      if (state.migrationVersion !== migration.version) throw new Error('Migration version does not match the stored journal');
      if (state.targetFingerprint !== options.targetFingerprint) throw new Error('Migration journal belongs to a different target database');
      if (options.checkpoint !== undefined && options.checkpoint !== (state.lastCheckpoint ?? 'START')) {
        throw new Error('Requested checkpoint does not match the stored migration checkpoint');
      }
      const unresolved = await this.journal.countUnresolvedRecords(migration.id, options.targetFingerprint);
      if (unresolved > 0) throw new Error('Migration journal contains planned or conflicted records; resolve them before verify');
    }
    const journalChecked = await this.verifyAppliedJournal(migration.id, options.targetFingerprint, options.batchSize);
    const result = await migration.verify(this.db, options.batchSize);
    return { ...result, journalChecked };
  }

  async rollback(
    migration: MigrationDefinition,
    options: { targetFingerprint: string; batchSize: number; dryRun: boolean },
  ): Promise<{ migrationId: string; eligible: number; restored: number; skipped: number; skipReasons: Record<string, number> }> {
    validateDefinition(migration);
    if (!migration.rollbackEvidence) throw new Error('This migration has no evidence-checked rollback implementation');
    const state = await this.journal.getState(migration.id);
    if (!state || state.status !== 'completed') throw new Error('Only a completed migration can be rolled back');
    if (state.targetFingerprint !== options.targetFingerprint) throw new Error('Migration journal belongs to a different target database');
    if (await this.journal.countUnresolvedRecords(migration.id, options.targetFingerprint) > 0) {
      throw new Error('Migration journal has unresolved records; resolve them before rollback');
    }
    const runId = randomUUID();
    if (!options.dryRun) await this.journal.acquireLock(migration.id, runId, LOCK_LEASE_MS);
    let eligible = 0;
    let restored = 0;
    let afterCheckpoint: string | null = null;
    const skipReasons: Record<string, number> = {};
    try {
      for (;;) {
        if (!options.dryRun) await this.journal.renewLock(migration.id, runId, LOCK_LEASE_MS);
        const records = await this.journal.getAppliedRecords(migration.id, options.targetFingerprint, afterCheckpoint, options.batchSize);
        if (!records.length) break;
        for (const record of records) {
          afterCheckpoint = record.checkpoint;
          const current = await this.db.collection(record.collection).findOne({ _id: record.sourceId } as Filter<Document>);
          const alreadyRestored = current !== null &&
            Object.keys(record.set).every((field) => !Object.hasOwn(current, field)) &&
            record.unset.every((field) => isDeepStrictEqual(current[field], record.beforeImage[field]));
          if (alreadyRestored) {
            if (!options.dryRun) await this.journal.markRolledBack(record._id);
            restored += 1;
            continue;
          }
          const reason = !current ? 'source-missing' : await migration.rollbackEvidence!(this.db, record, current);
          if (reason) { skipReasons[reason] = (skipReasons[reason] ?? 0) + 1; continue; }
          eligible += 1;
          if (options.dryRun) continue;
          await this.journal.renewLock(migration.id, runId, LOCK_LEASE_MS);
          const restoreSet: Record<string, unknown> = {};
          for (const field of record.unset) {
            if (Object.hasOwn(record.beforeImage, field)) restoreSet[field] = record.beforeImage[field];
          }
          const restoreUnset = Object.keys(record.set);
          const filter: Document = { _id: record.sourceId };
          for (const [field, value] of Object.entries(record.set)) filter[field] = value;
          for (const field of record.unset) filter[field] = { $exists: false };
          const update: UpdateFilter<Document> = {
            ...(Object.keys(restoreSet).length ? { $set: restoreSet } : {}),
            ...(restoreUnset.length ? { $unset: Object.fromEntries(restoreUnset.map((field) => [field, ''])) } : {}),
          };
          const changed = await this.db.collection(record.collection).updateOne(filter as Filter<Document>, update);
          if (changed.matchedCount !== 1) { skipReasons['changed-during-rollback'] = (skipReasons['changed-during-rollback'] ?? 0) + 1; continue; }
          await this.journal.markRolledBack(record._id);
          restored += 1;
        }
      }
      if (!options.dryRun) await this.journal.markMigrationRolledBack(migration.id, runId);
    } finally {
      if (!options.dryRun) await this.journal.releaseLock(migration.id, runId);
    }
    return { migrationId: migration.id, eligible, restored, skipped: Object.values(skipReasons).reduce((sum, count) => sum + count, 0), skipReasons };
  }

  private async applyJournalRecord(
    record: MigrationJournalRecord,
    runId: string,
    state: { lastCheckpoint: string | null },
    afterCompareAndSet?: () => Promise<void>,
  ): Promise<void> {
    const collection = this.db.collection(record.collection);
    const filter = { _id: record.sourceId } as Filter<Document>;
    const current = await collection.findOne(filter);
    if (!current) {
      return this.markConflictAndThrow(record._id, 'Migration source record is missing');
    }
    if (matchesDesired(current, record.set, record.unset)) {
      await this.journal.markOutcome(record._id, 'applied');
      if (state.lastCheckpoint !== record.checkpoint) {
        await this.journal.advanceCheckpoint(record.migrationId, runId, state.lastCheckpoint, record.checkpoint);
      }
      return;
    }
    if (record.outcome === 'applied') {
      throw new Error('An already-applied migration record no longer matches its journaled result');
    }

    const expectedFilter = { _id: record.sourceId, ...record.expectedOld } as Filter<Document>;
    const expectedCurrent = await collection.findOne(expectedFilter);
    if (!expectedCurrent) {
      return this.markConflictAndThrow(record._id, 'Migration source no longer matches its expected old values');
    }
    const update: UpdateFilter<Document> = {
      ...(Object.keys(record.set).length > 0 ? { $set: record.set } : {}),
      ...(record.unset.length > 0 ? { $unset: Object.fromEntries(record.unset.map((key) => [key, ''])) } : {}),
    };
    const result = await collection.updateOne(expectedFilter, update);
    if (result.matchedCount === 1) await afterCompareAndSet?.();
    if (result.matchedCount !== 1) {
      const reread = await collection.findOne(filter);
      if (!reread || !matchesDesired(reread, record.set, record.unset)) {
        return this.markConflictAndThrow(record._id, 'Migration compare-and-set did not match');
      }
    }
    await this.journal.markOutcome(record._id, 'applied');
    if (state.lastCheckpoint !== record.checkpoint) {
      await this.journal.advanceCheckpoint(record.migrationId, runId, state.lastCheckpoint, record.checkpoint);
    }
  }

  private async markConflictAndThrow(recordId: string, message: string): Promise<never> {
    await this.journal.markOutcome(recordId, 'conflict');
    throw new Error(message);
  }

  private validateBatch(
    batch: MigrationChange[],
    afterCheckpoint: string | null,
    limit: number,
  ): void {
    if (!Array.isArray(batch) || batch.length > limit) throw new Error('Migration returned an invalid batch size');
    let previous = afterCheckpoint;
    for (const change of batch) {
      if (
        !change ||
        typeof change.collection !== 'string' ||
        !/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(change.collection) ||
        MIGRATION_COLLECTIONS.has(change.collection) ||
        !change.rowId ||
        typeof change.checkpoint !== 'string' ||
        !/^[a-zA-Z0-9._:-]{1,256}$/.test(change.checkpoint) ||
        (previous !== null && change.checkpoint <= previous) ||
        !change.beforeImage ||
        change.beforeImage._id === undefined ||
        !isDeepStrictEqual(change.beforeImage._id, change.sourceId) ||
        !change.expectedOld || typeof change.expectedOld !== 'object' ||
        !change.set || typeof change.set !== 'object' ||
        (Object.keys(change.set).length === 0 && (change.unset ?? []).length === 0) ||
        !Array.isArray(change.unset ?? [])
      ) {
        throw new Error('Migration returned an invalid or non-monotonic change');
      }
      const fields = [...Object.keys(change.set), ...(change.unset ?? [])];
      if (fields.some((field) => !field || field.startsWith('$') || field === '_id') || new Set(fields).size !== fields.length) {
        throw new Error('Migration update contains an invalid or duplicate field');
      }
      if (Object.keys(change.expectedOld).some((field) => !field || field.startsWith('$') || field === '_id')) {
        throw new Error('Migration expected-old predicate contains an invalid field');
      }
      previous = change.checkpoint;
    }
  }

  private async verifyAppliedJournal(
    migrationId: string,
    targetFingerprint: string,
    batchSize: number,
  ): Promise<number> {
    let afterCheckpoint: string | null = null;
    let checked = 0;
    for (;;) {
      const records = await this.journal.getAppliedRecords(
        migrationId,
        targetFingerprint,
        afterCheckpoint,
        batchSize,
      );
      if (records.length === 0) return checked;
      for (const record of records) {
        const current = await this.db.collection(record.collection).findOne({ _id: record.sourceId } as Filter<Document>);
        if (!current || !matchesDesired(current, record.set, record.unset)) {
          throw new Error('An already-applied migration record no longer matches its journaled result');
        }
        afterCheckpoint = record.checkpoint;
        checked += 1;
      }
    }
  }
}

function validateDefinition(migration: MigrationDefinition): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(migration.id)) throw new Error('Migration ID is invalid');
  if (!Number.isSafeInteger(migration.version) || migration.version < 1) throw new Error('Migration version is invalid');
  if (typeof migration.description !== 'string' || migration.description.trim().length === 0) {
    throw new Error('Migration description is required');
  }
}

export function journalRecordId(migrationId: string, rowId: string): string {
  return createHash('sha256').update(`${migrationId}\0${rowId}`).digest('hex');
}

function stableChangeHashInput(change: MigrationChange): string {
  return JSON.stringify({
    collection: change.collection,
    rowId: change.rowId,
    checkpoint: change.checkpoint,
    expectedOld: change.expectedOld,
    beforeImage: change.beforeImage,
    set: change.set,
    unset: change.unset ?? [],
  });
}

function matchesDesired(document: Document, set: Record<string, unknown>, unset: string[]): boolean {
  return Object.entries(set).every(([field, value]) => isDeepStrictEqual(document[field], value)) &&
    unset.every((field) => !Object.hasOwn(document, field));
}
