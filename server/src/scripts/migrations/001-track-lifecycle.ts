import {
  ObjectId,
  type CreateIndexesOptions,
  type Document,
  type IndexSpecification,
} from 'mongodb';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../common/env.js';
import type { Schema } from 'mongoose';
import { CacheEventSchema } from '../../maintenance/schemas/cache-event.schema.js';
import { MediaOperationSchema } from '../../maintenance/schemas/media-operation.schema.js';
import { TrackSchema, TRACK_LIFECYCLE } from '../../track/schemas/track.schema.js';
import type {
  MigrationDefinition,
  MigrationVerification,
} from '../lib/migration-runner.js';

const TRACKS = 'tracks';
const INDEXED_SCHEMAS: readonly [string, Schema][] = [
  [TRACKS, TrackSchema],
  ['mediaoperations', MediaOperationSchema],
  ['cacheevents', CacheEventSchema],
];

export const trackLifecycleMigration: MigrationDefinition = {
  id: '001-track-lifecycle',
  version: 1,
  description: 'Backfill missing track lifecycle to active and install explicit lifecycle/operation indexes',

  async rollbackEvidence(_db, record, current) {
    if (record.collection !== TRACKS || record.set.lifecycle !== 'active' || Object.hasOwn(record.beforeImage, 'lifecycle')) return 'not-lifecycle-before-image';
    if (current.lifecycle !== 'active') return 'track-no-longer-active';
    const directoryStats = await lstat(env.staticDir).catch(() => undefined);
    if (!directoryStats?.isDirectory() || directoryStats.isSymbolicLink()) return 'static-root-unavailable-or-unsafe';
    for (const kind of ['audio', 'picture'] as const) {
      const key = record.beforeImage[kind];
      if (key === undefined || key === null || key === '') continue;
      if (typeof key !== 'string') return 'media-reference-invalid';
      const extensions = kind === 'audio' ? 'mp3|wav|ogg|oga|m4a|aac|flac' : 'jpg|jpeg|png|webp|avif|gif';
      if (!new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(?:${extensions})$`).test(key)) return 'media-reference-invalid';
      if (current[kind] !== key) return 'media-reference-changed';
      const directory = path.join(env.staticDir, kind);
      const directoryInfo = await lstat(directory).catch(() => undefined);
      if (!directoryInfo?.isDirectory() || directoryInfo.isSymbolicLink()) return 'media-directory-unavailable-or-unsafe';
      const mediaInfo = await lstat(path.join(directory, key)).catch(() => undefined);
      if (!mediaInfo?.isFile() || mediaInfo.isSymbolicLink()) return 'referenced-media-missing-or-unsafe';
    }
    return null;
  },

  async planBatch({ db, afterCheckpoint, limit }) {
    const filter: Document = { lifecycle: { $exists: false } };
    if (afterCheckpoint) filter._id = { $gt: new ObjectId(afterCheckpoint) };
    const documents = await db.collection(TRACKS)
      .find(filter)
      .sort({ _id: 1 })
      .limit(limit)
      .toArray();

    return documents.map((document) => {
      const checkpoint = String(document._id);
      return {
        collection: TRACKS,
        rowId: checkpoint,
        sourceId: document._id,
        checkpoint,
        expectedOld: { lifecycle: { $exists: false } },
        beforeImage: document,
        set: { lifecycle: 'active' },
      };
    });
  },

  async finalize(db) {
    for (const [collectionName, schema] of INDEXED_SCHEMAS) {
      const collection = db.collection(collectionName);
      for (const [keys, options] of schema.indexes()) {
        await collection.createIndex(keys as IndexSpecification, options as CreateIndexesOptions);
      }
    }
  },

  async verify(db, batchSize): Promise<MigrationVerification> {
    let checked = 0;
    const cursor = db.collection(TRACKS).find().project({ _id: 1 }).batchSize(batchSize);
    for await (const _document of cursor) checked += 1;

    const issueCount = await db.collection(TRACKS).countDocuments({
      lifecycle: { $nin: [...TRACK_LIFECYCLE] },
    });
    let missingIndexes = 0;
    for (const [collectionName, schema] of INDEXED_SCHEMAS) {
      const collectionExists = await db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
      const present = new Set(collectionExists
        ? (await db.collection(collectionName).listIndexes().toArray()).map((index) => index.name)
        : []);
      for (const [, options] of schema.indexes()) {
        if (!options.name || !present.has(options.name)) missingIndexes += 1;
      }
    }
    return { checked, issueCount: issueCount + missingIndexes };
  },
};
