import { isDeepStrictEqual } from 'node:util';
import type { IndexDescription } from 'mongodb';
import type { MigrationDefinition } from '../lib/migration-runner.js';
import { NotificationSchema } from '../../notifications/notification.schema.js';

const indexes = NotificationSchema.indexes().map(([key, options]) => ({ key, ...options }) as IndexDescription);
export const notificationIndexesMigration: MigrationDefinition = {
  id: '010-notification-indexes', version: 1,
  description: 'Create private inbox pagination, unread and unique event indexes',
  async planBatch() { return []; },
  async finalize(db) { await db.collection('notifications').createIndexes(indexes); },
  async verify(db) {
    const exists = await db.listCollections({ name: 'notifications' }).hasNext();
    const actual = exists ? await db.collection('notifications').listIndexes().toArray() : [];
    return { checked: indexes.length, issueCount: indexes.filter((expected) => !actual.some((index) =>
      index.name === expected.name && isDeepStrictEqual(index.key, expected.key)
      && Boolean(index.unique) === Boolean(expected.unique) && !index.collation
      && index.partialFilterExpression === undefined && index.sparse !== true && index.expireAfterSeconds === undefined,
    )).length };
  },
};
