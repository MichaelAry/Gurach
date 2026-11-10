import type { MigrationDefinition } from '../lib/migration-runner.js';
export const queueIndexesMigration: MigrationDefinition = {
  id: '006-queue-indexes', version: 1, description: 'Install one-queue-per-user unique index without backfilling queues',
  async planBatch() { return []; },
  async finalize(db) { await db.collection('queues').createIndex({ userId: 1 }, { unique: true, name: 'queue_user_unique' }); },
  async verify(db) {
    const exists = await db.listCollections({ name: 'queues' }).hasNext();
    const index = exists ? (await db.collection('queues').listIndexes().toArray()).find((value) => value.name === 'queue_user_unique') : undefined;
    return { checked: 1, issueCount: index?.unique === true && JSON.stringify(index.key) === JSON.stringify({ userId: 1 }) ? 0 : 1 };
  },
};
