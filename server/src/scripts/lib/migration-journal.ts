import { isDeepStrictEqual } from 'node:util';
import { Collection, Db, Document } from 'mongodb';

export interface MigrationState extends Document {
  _id: string;
  migrationVersion: number;
  targetFingerprint: string;
  lastCheckpoint: string | null;
  status: 'running' | 'completed' | 'rolledBack';
  lockOwner: string | null;
  lockUntil: Date | null;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface MigrationJournalRecord extends Document {
  _id: string;
  migrationId: string;
  migrationVersion: number;
  targetFingerprint: string;
  rowId: string;
  collection: string;
  sourceId: unknown;
  checkpoint: string;
  expectedOld: Record<string, unknown>;
  beforeImage: Document;
  set: Record<string, unknown>;
  unset: string[];
  outcome: 'planned' | 'applied' | 'conflict' | 'rolledBack';
  createdAt: Date;
  updatedAt: Date;
}

export interface NewJournalRecord extends Omit<MigrationJournalRecord, '_id' | 'createdAt' | 'updatedAt'> {
  _id: string;
}

export class MigrationJournal {
  private readonly states: Collection<MigrationState>;
  private readonly records: Collection<MigrationJournalRecord>;

  constructor(private readonly db: Db) {
    this.states = db.collection<MigrationState>('_gurach_migration_state');
    this.records = db.collection<MigrationJournalRecord>('_gurach_migration_journal');
  }

  async ensureIndexes(): Promise<void> {
    await this.records.createIndex(
      { migrationId: 1, targetFingerprint: 1, checkpoint: 1 },
      { name: 'migration_checkpoint' },
    );
    await this.records.createIndex(
      { migrationId: 1, outcome: 1 },
      { name: 'migration_outcome' },
    );
  }

  async initializeState(
    migrationId: string,
    migrationVersion: number,
    targetFingerprint: string,
  ): Promise<MigrationState> {
    let state = await this.states.findOne({ _id: migrationId });
    if (!state) {
      const now = new Date();
      try {
        await this.states.insertOne({
          _id: migrationId,
          migrationVersion,
          targetFingerprint,
          lastCheckpoint: null,
          status: 'running',
          lockOwner: null,
          lockUntil: null,
          startedAt: now,
          updatedAt: now,
        });
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }
      state = await this.states.findOne({ _id: migrationId });
    }
    if (!state) throw new Error('Could not initialize migration state');
    this.assertTarget(state, migrationVersion, targetFingerprint);
    return state;
  }

  async getState(migrationId: string): Promise<MigrationState | null> {
    return this.states.findOne({ _id: migrationId });
  }

  async acquireLock(migrationId: string, runId: string, leaseMs: number): Promise<void> {
    const now = new Date();
    const result = await this.states.updateOne(
      {
        _id: migrationId,
        $or: [
          { lockUntil: null },
          { lockUntil: { $lte: now } },
          { lockOwner: runId },
        ],
      },
      { $set: { lockOwner: runId, lockUntil: new Date(now.getTime() + leaseMs), updatedAt: now } },
    );
    if (result.matchedCount !== 1) throw new Error('Another migration runner holds the migration lease');
  }

  async renewLock(migrationId: string, runId: string, leaseMs: number): Promise<void> {
    const now = new Date();
    const result = await this.states.updateOne(
      { _id: migrationId, lockOwner: runId, lockUntil: { $gt: now } },
      { $set: { lockUntil: new Date(now.getTime() + leaseMs), updatedAt: now } },
    );
    if (result.matchedCount !== 1) throw new Error('Migration lease was lost');
  }

  async releaseLock(migrationId: string, runId: string): Promise<void> {
    await this.states.updateOne(
      { _id: migrationId, lockOwner: runId },
      { $set: { lockOwner: null, lockUntil: null, updatedAt: new Date() } },
    );
  }

  async getRecord(recordId: string): Promise<MigrationJournalRecord | null> {
    return this.records.findOne({ _id: recordId });
  }

  async getPendingRecords(
    migrationId: string,
    targetFingerprint: string,
    afterCheckpoint: string | null,
    limit: number,
  ): Promise<MigrationJournalRecord[]> {
    return this.records
      .find({
        migrationId,
        targetFingerprint,
        outcome: 'planned',
        ...(afterCheckpoint === null ? {} : { checkpoint: { $gt: afterCheckpoint } }),
      })
      .sort({ checkpoint: 1 })
      .limit(limit)
      .toArray();
  }

  async countUnresolvedRecords(migrationId: string, targetFingerprint: string): Promise<number> {
    return this.records.countDocuments({
      migrationId,
      targetFingerprint,
      outcome: { $in: ['planned', 'conflict'] },
    });
  }

  async getAppliedRecords(
    migrationId: string,
    targetFingerprint: string,
    afterCheckpoint: string | null,
    limit: number,
  ): Promise<MigrationJournalRecord[]> {
    return this.records
      .find({
        migrationId,
        targetFingerprint,
        outcome: 'applied',
        ...(afterCheckpoint === null ? {} : { checkpoint: { $gt: afterCheckpoint } }),
      })
      .sort({ checkpoint: 1 })
      .limit(limit)
      .toArray();
  }

  async createRecord(record: NewJournalRecord): Promise<MigrationJournalRecord> {
    const now = new Date();
    try {
      await this.records.insertOne({ ...record, createdAt: now, updatedAt: now } as MigrationJournalRecord);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    const stored = await this.records.findOne({ _id: record._id });
    if (!stored) throw new Error('Could not persist migration before-image');
    if (
      stored.migrationId !== record.migrationId ||
      stored.migrationVersion !== record.migrationVersion ||
      stored.targetFingerprint !== record.targetFingerprint ||
      stored.rowId !== record.rowId ||
      stored.checkpoint !== record.checkpoint ||
      !isDeepStrictEqual(stored.expectedOld, record.expectedOld) ||
      !isDeepStrictEqual(stored.beforeImage, record.beforeImage) ||
      !isDeepStrictEqual(stored.set, record.set) ||
      !isDeepStrictEqual(stored.unset, record.unset)
    ) {
      throw new Error('Existing migration journal entry does not match the planned before-image');
    }
    return stored;
  }

  async markOutcome(recordId: string, outcome: 'applied' | 'conflict'): Promise<void> {
    const result = await this.records.updateOne(
      { _id: recordId, outcome: 'planned' },
      { $set: { outcome, updatedAt: new Date() } },
    );
    if (result.matchedCount === 1) return;
    const existing = await this.records.findOne({ _id: recordId });
    if (existing?.outcome !== outcome) throw new Error('Migration journal outcome changed unexpectedly');
  }

  async markRolledBack(recordId: string): Promise<void> {
    const result = await this.records.updateOne(
      { _id: recordId, outcome: 'applied' },
      { $set: { outcome: 'rolledBack', updatedAt: new Date() } },
    );
    if (result.matchedCount === 1) return;
    const existing = await this.records.findOne({ _id: recordId });
    if (existing?.outcome !== 'rolledBack') throw new Error('Migration journal outcome changed during rollback');
  }

  async markMigrationRolledBack(migrationId: string, runId: string): Promise<void> {
    const result = await this.states.updateOne(
      { _id: migrationId, lockOwner: runId, status: 'completed' },
      { $set: { status: 'rolledBack', updatedAt: new Date() } },
    );
    if (result.matchedCount !== 1) throw new Error('Could not mark migration rolled back under its lease');
  }

  async advanceCheckpoint(
    migrationId: string,
    runId: string,
    previous: string | null,
    next: string,
  ): Promise<void> {
    const result = await this.states.updateOne(
      { _id: migrationId, lockOwner: runId, lastCheckpoint: previous },
      { $set: { lastCheckpoint: next, updatedAt: new Date(), status: 'running' } },
    );
    if (result.matchedCount !== 1) throw new Error('Migration checkpoint compare-and-set failed');
  }

  async complete(migrationId: string, runId: string, checkpoint: string | null): Promise<void> {
    const result = await this.states.updateOne(
      { _id: migrationId, lockOwner: runId, lastCheckpoint: checkpoint },
      { $set: { status: 'completed', completedAt: new Date(), updatedAt: new Date() } },
    );
    if (result.matchedCount !== 1) throw new Error('Could not mark migration complete at the expected checkpoint');
  }

  private assertTarget(
    state: MigrationState,
    migrationVersion: number,
    targetFingerprint: string,
  ): void {
    if (state.migrationVersion !== migrationVersion) {
      throw new Error('Migration version does not match the existing checkpoint');
    }
    if (state.targetFingerprint !== targetFingerprint) {
      throw new Error('Migration checkpoint belongs to a different database target');
    }
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
