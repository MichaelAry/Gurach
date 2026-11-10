import type { IndexDescription } from 'mongodb';
import type { MigrationDefinition } from '../lib/migration-runner.js';
import { SocialRelationSchema } from '../../friends/schemas/social-relation.schema.js';
import { FriendRequestCounterSchema } from '../../friends/schemas/friend-request-counter.schema.js';

const indexes: { collection: string; indexes: IndexDescription[] }[] = [
  { collection: 'social_relations', indexes: SocialRelationSchema.indexes().map(([key, options]) => ({ key, ...options }) as IndexDescription) },
  { collection: 'friend_request_counters', indexes: FriendRequestCounterSchema.indexes().map(([key, options]) => ({ key, ...options }) as IndexDescription) },
  { collection: 'users', indexes: [{ key: { username: 1, _id: 1 }, name: 'user_username_page' }] },
];
export const socialRelationsMigration: MigrationDefinition = {
  id: '007-social-relations', version: 1, description: 'Create social relation, quota and username pagination indexes',
  async planBatch() { return []; },
  async finalize(db) {
    for (const group of indexes) await db.collection(group.collection).createIndexes(group.indexes);
  },
  async verify(db) {
    let checked = 0, issueCount = 0;
    for (const group of indexes) {
      const exists = await db.listCollections({ name: group.collection }).hasNext();
      const actual = exists ? await db.collection(group.collection).listIndexes().toArray() : [];
      for (const expected of group.indexes) {
        checked++;
        const index = actual.find((value) => value.name === expected.name);
        if (!index || JSON.stringify(index.key) !== JSON.stringify(expected.key) ||
          Boolean(index.unique) !== Boolean(expected.unique) ||
          Boolean(index.sparse) !== Boolean(expected.sparse) ||
          JSON.stringify(index.partialFilterExpression) !== JSON.stringify(expected.partialFilterExpression) ||
          index.expireAfterSeconds !== expected.expireAfterSeconds || index.collation !== undefined) issueCount++;
      }
    }
    return { checked, issueCount };
  },
};
