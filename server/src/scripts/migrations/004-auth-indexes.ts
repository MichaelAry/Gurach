import type { CreateIndexesOptions, IndexSpecification } from 'mongodb';
import type { Schema } from 'mongoose';
import type { MigrationDefinition } from '../lib/migration-runner.js';
import { UserSchema } from '../../auth/schemas/user.schema.js';
import { SessionSchema } from '../../auth/schemas/session.schema.js';

const schemas: [string, Schema][] = [['users', UserSchema], ['sessions', SessionSchema]];
export const authIndexesMigration: MigrationDefinition = {
  id: '004-auth-indexes', version: 1, description: 'Install unique account/token indexes and session expiry cleanup',
  async planBatch() { return []; },
  async finalize(db) {
    for (const [name, schema] of schemas) for (const [keys, options] of schema.indexes()) {
      await db.collection(name).createIndex(keys as IndexSpecification, options as CreateIndexesOptions);
    }
  },
  async verify(db) {
    let issueCount = 0;
    for (const [name, schema] of schemas) {
      const exists = await db.listCollections({ name }).hasNext();
      const indexes = exists ? await db.collection(name).listIndexes().toArray() : [];
      for (const [keys, options] of schema.indexes()) {
        const index = indexes.find((item) => item.name === options.name);
        if (!index || JSON.stringify(index.key) !== JSON.stringify(keys) ||
          Boolean(index.unique) !== Boolean(options.unique) || index.expireAfterSeconds !== options.expireAfterSeconds) issueCount += 1;
      }
    }
    return { checked: 3, issueCount };
  },
};
