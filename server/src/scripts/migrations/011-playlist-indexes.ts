import { isDeepStrictEqual } from 'node:util';
import type { IndexDescription } from 'mongodb';
import type { MigrationDefinition } from '../lib/migration-runner.js';
import { PlaylistSchema } from '../../playlists/playlist.schema.js';

const indexes = PlaylistSchema.indexes().map(([key, options]) => ({ key, ...options }) as IndexDescription);
export const playlistIndexesMigration: MigrationDefinition = {
  id: '011-playlist-indexes', version: 1,
  description: 'Create private playlist owner and token indexes',
  async planBatch() { return []; },
  async finalize(db) { await db.collection('playlists').createIndexes(indexes); },
  async verify(db) {
    const exists = await db.listCollections({ name: 'playlists' }).hasNext();
    const actual = exists ? await db.collection('playlists').listIndexes().toArray() : [];
    return { checked: indexes.length, issueCount: indexes.filter((expected) => !actual.some((index) =>
      index.name === expected.name && isDeepStrictEqual(index.key, expected.key)
      && Boolean(index.unique) === Boolean(expected.unique) && !index.collation
      && index.partialFilterExpression === undefined && index.sparse !== true && index.expireAfterSeconds === undefined,
    )).length };
  },
};
