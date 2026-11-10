import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { Db } from 'mongodb';
import { env } from '../../common/env.js';

export type MigrationCommand =
  | 'db:audit'
  | 'db:migrate:plan'
  | 'db:migrate:apply'
  | 'db:migrate:verify'
  | 'db:migrate:rollback';

export interface MigrationCliOptions {
  command: MigrationCommand;
  migration?: string;
  database?: string;
  batchSize: number;
  checkpoint?: string;
  report?: string;
  expectedFingerprint?: string;
  dryRun: boolean;
  apply: boolean;
}

const DATABASE_NAME = /^[a-zA-Z0-9_-]{1,63}$/;
const MIGRATION_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CHECKPOINT = /^[a-zA-Z0-9._:-]{1,256}$/;
const SYSTEM_DATABASES = new Set(['admin', 'config', 'local']);

export function parseMigrationArguments(argv: string[]): MigrationCliOptions {
  const command = argv[0] as MigrationCommand | undefined;
  if (!command || !['db:audit', 'db:migrate:plan', 'db:migrate:apply', 'db:migrate:verify', 'db:migrate:rollback'].includes(command)) {
    throw new Error('Usage: db:audit|db:migrate:plan|db:migrate:apply|db:migrate:verify|db:migrate:rollback [options]');
  }
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const flagNames = new Set(['--dry-run', '--apply']);
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error('Unexpected positional argument');
    const separator = argument.indexOf('=');
    const name = separator < 0 ? argument : argument.slice(0, separator);
    if (!['--migration', '--database', '--batch-size', '--checkpoint', '--report', '--expected-fingerprint', ...flagNames].includes(name)) {
      throw new Error(`Unknown option: ${name}`);
    }
    if (values.has(name) || flags.has(name)) throw new Error(`Option supplied more than once: ${name}`);
    if (flagNames.has(name)) {
      if (separator >= 0) throw new Error(`${name} does not accept a value`);
      flags.add(name);
      continue;
    }
    const value = separator >= 0 ? argument.slice(separator + 1) : argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    values.set(name, value);
  }

  const migration = values.get('--migration');
  const database = values.get('--database');
  const rawBatchSize = values.get('--batch-size');
  const batchSize = rawBatchSize === undefined ? 100 : Number(rawBatchSize);
  if (rawBatchSize !== undefined && (!/^\d+$/.test(rawBatchSize) || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000)) {
    throw new Error('--batch-size must be a decimal integer from 1 to 1000');
  }
  if (migration && !MIGRATION_ID.test(migration)) throw new Error('--migration has an invalid ID');
  if (database) validateDatabaseName(database);
  if (['db:migrate:plan', 'db:migrate:apply', 'db:migrate:verify', 'db:migrate:rollback'].includes(command)) {
    if (!migration) throw new Error('--migration is required for migration commands');
    if (!database) throw new Error('--database is required for migration commands');
  } else if (migration) {
    throw new Error('--migration is not valid with db:audit');
  }
  const checkpoint = values.get('--checkpoint');
  if (checkpoint && !CHECKPOINT.test(checkpoint)) throw new Error('--checkpoint has an invalid format');
  const apply = flags.has('--apply');
  const dryRun = flags.has('--dry-run') || (command === 'db:migrate:rollback' && !apply);
  if (command === 'db:migrate:apply' && !dryRun && !apply) {
    throw new Error('db:migrate:apply requires --apply; use --dry-run to preview without writes');
  }
  if (command === 'db:migrate:apply' && dryRun && apply) {
    throw new Error('--apply and --dry-run cannot be combined');
  }
  if (command === 'db:migrate:rollback' && (dryRun && apply)) throw new Error('--apply and --dry-run cannot be combined');
  if (apply && !['db:migrate:apply', 'db:migrate:rollback'].includes(command)) throw new Error('--apply is valid only with migration apply or rollback');
  if (dryRun && !['db:migrate:apply', 'db:migrate:rollback'].includes(command)) throw new Error('--dry-run is valid only with migration apply or rollback');
  const expectedFingerprint = values.get('--expected-fingerprint');
  if (expectedFingerprint && (!/^[a-f0-9]{64}$/.test(expectedFingerprint) || command !== 'db:migrate:rollback' || !apply)) {
    throw new Error('--expected-fingerprint requires db:migrate:rollback --apply and a lowercase SHA-256 fingerprint');
  }
  if (command === 'db:migrate:rollback') {
    if (!values.get('--report')) throw new Error('db:migrate:rollback requires --report inside .local/migration-private');
    if (apply && !expectedFingerprint) throw new Error('db:migrate:rollback --apply requires --expected-fingerprint from the reviewed dry-run');
  }
  if (migration === '002-comment-parents' && ['db:migrate:plan', 'db:migrate:apply'].includes(command) && !values.has('--report')) {
    throw new Error('Comment-parent plan/apply requires a private --report path');
  }
  if (command === 'db:migrate:apply' && expectedFingerprint) throw new Error('--expected-fingerprint is only valid with db:migrate:rollback --apply');

  return {
    command,
    ...(migration ? { migration } : {}),
    ...(database ? { database } : {}),
    batchSize,
    ...(checkpoint ? { checkpoint } : {}),
    ...(values.get('--report') ? { report: values.get('--report') } : {}),
    ...(expectedFingerprint ? { expectedFingerprint } : {}),
    dryRun,
    apply,
  };
}

export function validateDatabaseName(databaseName: string): void {
  if (!DATABASE_NAME.test(databaseName) || SYSTEM_DATABASES.has(databaseName)) {
    throw new Error('Target database name is invalid or reserved');
  }
}

export function databaseFromUri(uri: string): string {
  const pathname = new URL(uri).pathname.replace(/^\//, '');
  const name = pathname.split('/')[0] || 'test';
  validateDatabaseName(name);
  return name;
}

export function assertSafeApplyTarget(databaseName: string): void {
  validateDatabaseName(databaseName);
  if (!/^gurach_test_[a-zA-Z0-9_-]+$/.test(databaseName)) {
    throw new Error('Apply is restricted to an isolated gurach_test_* database in this migration-framework phase');
  }
}

export function createTargetFingerprint(databaseName: string, hello: Record<string, unknown>): string {
  const serviceId = hello.serviceId;
  const serviceIdHex = typeof serviceId === 'object' && serviceId !== null && 'toHexString' in serviceId &&
    typeof serviceId.toHexString === 'function'
    ? serviceId.toHexString()
    : null;
  const stableIdentity = {
    databaseName,
    setName: hello.setName ?? null,
    serviceId: serviceIdHex,
    hosts: Array.isArray(hello.hosts) ? [...hello.hosts].map(String).sort() : [],
    standaloneHost: !hello.setName && !serviceIdHex
      ? (typeof hello.me === 'string' ? hello.me : typeof hello.primary === 'string' ? hello.primary : null)
      : null,
  };
  return createHash('sha256').update(JSON.stringify(stableIdentity)).digest('hex');
}

export async function auditDatabase(db: Db): Promise<{
  collections: { name: string; estimatedDocuments: number }[];
  collectionCount: number;
  estimatedDocumentCount: number;
  checksum: string;
}> {
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map(({ name }) => name)
    .filter((name) => !name.startsWith('system.'))
    .sort();
  const collections: { name: string; estimatedDocuments: number }[] = [];
  for (const name of names) {
    const estimatedDocuments = await db.collection(name).estimatedDocumentCount();
    collections.push({ name, estimatedDocuments });
  }
  const estimatedDocumentCount = collections.reduce((sum, collection) => sum + collection.estimatedDocuments, 0);
  const checksum = createHash('sha256').update(JSON.stringify(collections)).digest('hex');
  return { collections, collectionCount: collections.length, estimatedDocumentCount, checksum };
}

export function resolveReportPath(rawPath: string): string {
  const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const privateRoot = path.join(workspaceRoot, '.local', 'migration-private');
  const destination = path.resolve(workspaceRoot, rawPath);
  if (destination === privateRoot || !destination.startsWith(`${privateRoot}${path.sep}`)) {
    throw new Error('--report must be placed inside .local/migration-private/');
  }
  return destination;
}

export function getMongoUri(): string {
  return env.mongodbUri;
}
