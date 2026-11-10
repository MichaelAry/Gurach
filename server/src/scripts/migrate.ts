import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, MongoError } from 'mongodb';
import { redactSecrets } from '../common/env-validation.js';
import {
  assertSafeApplyTarget,
  auditDatabase,
  createTargetFingerprint,
  databaseFromUri,
  getMongoUri,
  parseMigrationArguments,
  resolveReportPath,
} from './lib/migration-context.js';
import { MigrationRunner } from './lib/migration-runner.js';
import { migrationDefinitions } from './migrations/registry.js';

async function main(): Promise<void> {
  const options = parseMigrationArguments(process.argv.slice(2));
  if (options.report) resolveReportPath(options.report);
  const uri = getMongoUri();
  const databaseName = options.database ?? databaseFromUri(uri);
  const migration = options.migration
    ? migrationDefinitions.find((candidate) => candidate.id === options.migration)
    : undefined;
  if (options.migration && !migration) {
    const registered = migrationDefinitions.map(({ id }) => id);
    throw new Error(registered.length
      ? `Unknown migration ID. Registered IDs: ${registered.join(', ')}`
      : 'No domain migrations are registered yet; P4 will add the first migration.');
  }
  if (options.apply) assertSafeApplyTarget(databaseName);

  const client = new MongoClient(uri, {
    appName: 'gurach-migrations',
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    await client.connect();
    const db = client.db(databaseName);
    const hello = await client.db('admin').command({ hello: 1 });
    const targetFingerprint = createTargetFingerprint(databaseName, hello);
    if (options.command === 'db:migrate:rollback' && options.apply && options.expectedFingerprint !== targetFingerprint) {
      throw new Error('Mongo target fingerprint changed since the reviewed rollback dry-run');
    }
    let result: Record<string, unknown>;
    if (options.command === 'db:audit') {
      result = {
        command: options.command,
        database: databaseName,
        targetFingerprint,
        ...(await auditDatabase(db)),
      };
    } else if (!migration) {
      throw new Error('A registered migration is required');
    } else {
      const runner = new MigrationRunner(db);
      if (options.command === 'db:migrate:plan') {
        result = {
          command: options.command,
          database: databaseName,
          targetFingerprint,
          description: migration.description,
          ...(await runner.plan(migration, options)),
        };
      } else if (options.command === 'db:migrate:apply') {
        result = {
          command: options.command,
          database: databaseName,
          targetFingerprint,
          dryRun: options.dryRun,
          ...(await runner.apply(migration, {
            targetFingerprint,
            batchSize: options.batchSize,
            ...(options.checkpoint ? { checkpoint: options.checkpoint } : {}),
            dryRun: options.dryRun,
          })),
        };
      } else if (options.command === 'db:migrate:rollback') {
        const rollbackOptions = { targetFingerprint, batchSize: options.batchSize, dryRun: true };
        const preview = await runner.rollback(migration, rollbackOptions);
        if (options.apply && options.report) {
          const initial = { command: options.command, database: databaseName, targetFingerprint, mode: 'apply-in-progress', ...preview };
          await writePrivateReport(options.report, initial);
          const applied = await runner.rollback(migration, { ...rollbackOptions, dryRun: false });
          result = { command: options.command, database: databaseName, targetFingerprint, mode: 'apply', ...applied };
          await writePrivateReport(options.report, result, true);
        } else {
          result = { command: options.command, database: databaseName, targetFingerprint, mode: 'dry-run', ...preview };
        }
      } else {
        result = {
          command: options.command,
          database: databaseName,
          targetFingerprint,
          ...(await runner.verify(migration, {
            targetFingerprint,
            batchSize: options.batchSize,
            ...(options.checkpoint ? { checkpoint: options.checkpoint } : {}),
          })),
        };
      }
    }
    if (options.report && !(options.command === 'db:migrate:rollback' && options.apply)) await writePrivateReport(options.report, result);
    const stdoutResult = { ...result };
    if (migration?.privateAudit && typeof result.audit === 'object' && result.audit !== null) {
      const audit = result.audit as Record<string, unknown>;
      stdoutResult.audit = Object.fromEntries(
        ['commentCount', 'reverseReferenceCount', 'counts', 'reverseCounts', 'commentChecksum', 'reverseChecksum']
          .filter((key) => key in audit)
          .map((key) => [key, audit[key]]),
      );
    }
    process.stdout.write(`${JSON.stringify(stdoutResult, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

async function writePrivateReport(rawPath: string, result: Record<string, unknown>, replace = false): Promise<void> {
  const destination = resolveReportPath(rawPath);
  const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const localRoot = path.join(workspaceRoot, '.local');
  const privateRoot = path.join(localRoot, 'migration-private');
  if (path.dirname(destination) !== privateRoot) {
    throw new Error('Report files must be placed directly inside .local/migration-private');
  }
  try {
    const localStats = await lstat(localRoot);
    if (!localStats.isDirectory() || localStats.isSymbolicLink()) {
      throw new Error('.local must be a real directory');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await mkdir(localRoot, { recursive: false, mode: 0o700 });
  }
  try {
    const rootStats = await lstat(privateRoot);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink() || (rootStats.mode & 0o077) !== 0) {
      throw new Error('.local/migration-private must be a real directory with owner-only permissions');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await mkdir(privateRoot, { recursive: false, mode: 0o700 });
  }
  const privateRealPath = await realpath(privateRoot);
  const parentRealPath = await realpath(path.dirname(destination));
  if (parentRealPath !== privateRealPath) {
    throw new Error('Report files must be placed directly inside .local/migration-private');
  }
  const body = `${JSON.stringify(result, null, 2)}\n`;
  if (!replace) {
    await writeFile(destination, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  } else {
    const existing = await lstat(destination);
    if (!existing.isFile() || existing.isSymbolicLink() || (existing.mode & 0o077) !== 0) throw new Error('Existing rollback report is not a private regular file');
    const handle = await open(destination, constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW);
    try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); }
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof MongoError
    ? 'MongoDB operation failed; no document values were printed.'
    : error instanceof Error ? error.message : 'Migration command failed';
  process.stderr.write(`${redactSecrets(message)}\n`);
  process.exitCode = 1;
});
