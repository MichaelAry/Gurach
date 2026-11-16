import { AUDIO_EXACT_INDEXES, audioIndexPartial, isAudioExactIndex } from '../../track/schemas/track.schema.js';
import type { MigrationDefinition } from '../lib/migration-runner.js';

export const audioFingerprintIndexesMigration: MigrationDefinition = {
  id: '009-audio-fingerprint-indexes', version: 1,
  description: 'Install partial unique exact audio indexes; use audio:backfill separately for legacy files',
  async planBatch() { return []; },
  async finalize(db) {
    for (const { field, name } of AUDIO_EXACT_INDEXES) {
      // Existing collisions fail DDL; never remove or rewrite old tracks.
      await db.collection('tracks').createIndex({ [field]: 1 }, {
        name, unique: true, partialFilterExpression: audioIndexPartial(field),
      });
    }
    await db.collection('tracks').createIndex({ lifecycle: 1, 'audioFingerprint.duration': 1 }, { name: 'track_audio_duration_candidates' });
  },
  async verify(db) {
    const exists = await db.listCollections({ name: 'tracks' }).hasNext();
    const indexes = exists ? await db.collection('tracks').listIndexes().toArray() : [];
    return { checked: AUDIO_EXACT_INDEXES.length, issueCount: AUDIO_EXACT_INDEXES.filter((definition) => !indexes.some((index) => isAudioExactIndex(index, definition))).length };
  },
};
