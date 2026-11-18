import { existsSync, mkdirSync, chmodSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { MongoClient } from 'mongodb';
import { createTargetFingerprint } from './dist/scripts/lib/migration-context.js';
import { MigrationRunner } from './dist/scripts/lib/migration-runner.js';
import { migrationDefinitions } from './dist/scripts/migrations/registry.js';

mkdirSync('/data/staging', { recursive: true, mode: 0o700 });
chmodSync('/data/staging', 0o700);

// This service runs before any application writers on the installer's private MongoDB.
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
await client.connect();
try {
  const db = client.db('gurach');
  const hello = await client.db('admin').command({ hello: 1 });
  if (!hello.isWritablePrimary || hello.setName !== 'rs0') {
    throw new Error('Installer MongoDB is not the writable replica set primary');
  }
  const targetFingerprint = createTargetFingerprint(db.databaseName, hello);
  const states = await db.collection('_gurach_migration_state').find().toArray();
  const pending = migrationDefinitions.filter(migration =>
    !states.some(state => state._id === migration.id && state.status === 'completed' &&
      state.migrationVersion === migration.version && state.targetFingerprint === targetFingerprint));
  if (pending.length) {
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      if (name.startsWith('_gurach_migration_')) continue;
      if (await db.collection(name).findOne({}, { projection: { _id: 1 } })) {
        throw new Error('Installer schema bootstrap requires an empty database. Follow the documented migration workflow for existing data.');
      }
    }
    const runner = new MigrationRunner(db);
    for (const migration of pending) {
      await runner.apply(migration, { targetFingerprint, batchSize: 100 });
      if ((await runner.verify(migration, { targetFingerprint, batchSize: 100 })).issueCount) {
        throw new Error(`Schema verification failed for ${migration.id}`);
      }
      process.stdout.write(`Applied ${migration.id}\n`);
    }
  }
} finally {
  await client.close();
}

const marker = '/data/.initial-account';
if (!existsSync(marker)) {
  const result = spawnSync(process.execPath, ['dist/scripts/auth-provision.js', 'gurach', 'Gurach', 'admin', 'gurach'], {
    input: process.env.GURACH_INITIAL_PASSWORD,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  // The stable password also covers interruption between creating the account and writing the marker.
  if (result.status !== 0 && !result.stderr.includes('Account already exists;')) {
    process.stderr.write(result.stderr);
    process.exit(1);
  }
  writeFileSync(marker, 'provisioned\n', { mode: 0o600 });
}
