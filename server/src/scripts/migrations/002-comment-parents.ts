import { createHash } from 'node:crypto';
import { BSON, ObjectId, type CreateIndexesOptions, type Db, type Document, type IndexSpecification } from 'mongodb';
import { CommentSchema } from '../../comment/schemas/comment.schema.js';
import type { MigrationChange, MigrationDefinition, MigrationVerification } from '../lib/migration-runner.js';

const COMMENTS = 'comments';
const TRACKS = 'tracks';
const QUARANTINE = 'comment_quarantine';
const MIGRATION_ID = '002-comment-parents';

type Classification = {
  commentId: string;
  category: 'authoritative' | 'authoritative_reverse_disagreement' | 'normalize_string_link' |
    'repair_from_single_reverse' | 'unresolved_no_parent' | 'unresolved_multiple_reverse' | 'already_quarantined';
  authoritativeTrackId?: string;
  candidateTrackIds: string[];
};

type ReverseEntry = { trackId: string; commentId: string | null; category: 'candidate' | 'malformed' };
type ReverseClassification = { trackId: string; commentId: string | null; category: 'malformed' | 'dangling' | 'linked' };

function idFrom(value: unknown): ObjectId | null {
  if (value instanceof ObjectId) return value;
  if (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)) return new ObjectId(value);
  return null;
}

function serialize(value: unknown): string {
  return BSON.EJSON.stringify(value, { relaxed: false });
}

function checksum(value: unknown): string {
  return createHash('sha256').update(serialize(value)).digest('hex');
}

async function buildReferences(db: Db): Promise<{
  trackIds: Set<string>;
  reverse: Map<string, Set<string>>;
  reverseEntries: ReverseEntry[];
}> {
  const trackIds = new Set<string>();
  const reverse = new Map<string, Set<string>>();
  const reverseEntries: ReverseEntry[] = [];
  const cursor = db.collection(TRACKS).find({}, { projection: { _id: 1, comments: 1 } }).sort({ _id: 1 }).batchSize(500);
  for await (const track of cursor) {
    const trackObjectId = track._id instanceof ObjectId ? track._id : null;
    const trackId = trackObjectId?.toHexString() ?? String(track._id);
    if (trackObjectId) trackIds.add(trackId);
    if (!Array.isArray(track.comments)) continue;
    for (const rawCommentId of track.comments) {
      const commentId = idFrom(rawCommentId);
      if (!trackObjectId || !commentId) {
        reverseEntries.push({ trackId, commentId: null, category: 'malformed' });
        continue;
      }
      const normalizedCommentId = commentId.toHexString();
      const parents = reverse.get(normalizedCommentId) ?? new Set<string>();
      parents.add(trackId);
      reverse.set(normalizedCommentId, parents);
      reverseEntries.push({ trackId, commentId: normalizedCommentId, category: 'candidate' });
    }
  }
  return { trackIds, reverse, reverseEntries };
}

function classify(comment: Document, trackIds: Set<string>, reverse: Map<string, Set<string>>): Classification {
  const commentId = String(comment._id);
  const candidates = [...(reverse.get(commentId) ?? [])].sort();
  if (comment.migrationQuarantineId === MIGRATION_ID) {
    return { commentId, category: 'already_quarantined', candidateTrackIds: candidates };
  }
  const linkedId = idFrom(comment.track_id);
  const linkedHex = linkedId?.toHexString();
  if (linkedHex && trackIds.has(linkedHex)) {
    if (!(comment.track_id instanceof ObjectId)) {
      return { commentId, category: 'normalize_string_link', authoritativeTrackId: linkedHex, candidateTrackIds: candidates };
    }
    return {
      commentId,
      category: candidates.some((candidate) => candidate !== linkedHex)
        ? 'authoritative_reverse_disagreement'
        : 'authoritative',
      authoritativeTrackId: linkedHex,
      candidateTrackIds: candidates,
    };
  }
  if (candidates.length === 1 && trackIds.has(candidates[0])) {
    return { commentId, category: 'repair_from_single_reverse', authoritativeTrackId: candidates[0], candidateTrackIds: candidates };
  }
  return {
    commentId,
    category: candidates.length > 1 ? 'unresolved_multiple_reverse' : 'unresolved_no_parent',
    candidateTrackIds: candidates,
  };
}

function expectedTrackId(comment: Document): Record<string, unknown> {
  return Object.hasOwn(comment, 'track_id')
    ? { track_id: comment.track_id }
    : { track_id: { $exists: false } };
}

async function classifyAll(db: Db): Promise<{
  classifications: Classification[];
  reverseReferences: ReverseClassification[];
  commentChecksum: string;
  reverseChecksum: string;
}> {
  const references = await buildReferences(db);
  const classifications: Classification[] = [];
  const commentIds = new Set<string>();
  const commentHash = createHash('sha256');
  const cursor = db.collection(COMMENTS).find().sort({ _id: 1 }).batchSize(500);
  for await (const comment of cursor) {
    const id = String(comment._id);
    commentIds.add(id);
    commentHash.update(serialize(comment));
    commentHash.update('\n');
    classifications.push(classify(comment, references.trackIds, references.reverse));
  }
  const reverseReferences = references.reverseEntries.map((entry) => ({
    ...entry,
    category: entry.category === 'malformed' ? 'malformed' as const
      : commentIds.has(entry.commentId!) ? 'linked' as const : 'dangling' as const,
  }));
  const reverseHash = createHash('sha256');
  for (const entry of reverseReferences) reverseHash.update(`${serialize(entry)}\n`);
  return {
    classifications,
    reverseReferences,
    commentChecksum: commentHash.digest('hex'),
    reverseChecksum: reverseHash.digest('hex'),
  };
}

function summarize(classifications: Classification[], reverseReferences: ReverseClassification[]) {
  const counts: Record<string, number> = {};
  for (const item of classifications) counts[item.category] = (counts[item.category] ?? 0) + 1;
  const reverseCounts: Record<string, number> = {};
  for (const item of reverseReferences) reverseCounts[item.category] = (reverseCounts[item.category] ?? 0) + 1;
  return { counts, reverseCounts };
}

async function planBatch({ db, afterCheckpoint, limit }: { db: Db; afterCheckpoint: string | null; limit: number }): Promise<MigrationChange[]> {
  const { trackIds, reverse } = await buildReferences(db);
  const filter: Document = afterCheckpoint ? { _id: { $gt: new ObjectId(afterCheckpoint) } } : {};
  const cursor = db.collection(COMMENTS).find(filter).sort({ _id: 1 }).batchSize(500);
  const changes: MigrationChange[] = [];
  for await (const comment of cursor) {
    const result = classify(comment, trackIds, reverse);
    let set: Record<string, unknown> | undefined;
    if (result.category === 'normalize_string_link' || result.category === 'repair_from_single_reverse') {
      set = { track_id: new ObjectId(result.authoritativeTrackId!) };
    } else if (result.category === 'unresolved_no_parent' || result.category === 'unresolved_multiple_reverse') {
      set = {
        migrationQuarantineId: MIGRATION_ID,
        migrationQuarantineReason: result.category,
      };
    }
    if (!set) continue;
    const checkpoint = String(comment._id);
    changes.push({
      collection: COMMENTS,
      rowId: checkpoint,
      sourceId: comment._id,
      checkpoint,
      expectedOld: expectedTrackId(comment),
      beforeImage: comment,
      set,
    });
    if (changes.length >= limit) break;
  }
  return changes;
}

export const commentParentsMigration: MigrationDefinition = {
  id: MIGRATION_ID,
  version: 1,
  description: 'Make comment.track_id authoritative, repair unique reverse references and quarantine unresolved comments',
  planBatch,
  privateAudit: true,

  async audit(db) {
    const result = await classifyAll(db);
    const summary = summarize(result.classifications, result.reverseReferences);
    return {
      commentCount: result.classifications.length,
      reverseReferenceCount: result.reverseReferences.length,
      ...summary,
      classifications: result.classifications,
      reverseReferences: result.reverseReferences,
      commentChecksum: result.commentChecksum,
      reverseChecksum: result.reverseChecksum,
    };
  },

  async finalize(db) {
    const quarantine = db.collection(QUARANTINE);
    for (const [keys, options] of CommentSchema.indexes()) {
      await db.collection(COMMENTS).createIndex(keys as IndexSpecification, options as CreateIndexesOptions);
    }
    await quarantine.createIndex(
      { migrationId: 1, originalId: 1 },
      { name: 'comment_quarantine_migration_original_unique', unique: true },
    );
    const journal = db.collection('_gurach_migration_journal');
    const cursor = journal.find({
      migrationId: MIGRATION_ID,
      outcome: 'applied',
      'set.migrationQuarantineId': MIGRATION_ID,
    }).sort({ checkpoint: 1 }).batchSize(200);
    for await (const record of cursor) {
      const beforeImage = record.beforeImage as Document;
      const documentChecksum = checksum(beforeImage);
      const candidate = {
        migrationId: MIGRATION_ID,
        originalId: beforeImage._id,
        reason: record.set.migrationQuarantineReason,
        beforeImage,
        checksum: documentChecksum,
      };
      await quarantine.updateOne(
        { migrationId: MIGRATION_ID, originalId: beforeImage._id },
        { $setOnInsert: candidate },
        { upsert: true },
      );
      const stored = await quarantine.findOne({ migrationId: MIGRATION_ID, originalId: beforeImage._id });
      if (!stored || stored.checksum !== documentChecksum || serialize(stored.beforeImage) !== serialize(beforeImage)) {
        throw new Error('Comment quarantine copy failed before-image verification');
      }
    }
  },

  async verify(db, _batchSize): Promise<MigrationVerification> {
    const references = await buildReferences(db);
    let checked = 0;
    let invalidActiveParents = 0;
    let quarantineRowsMissing = 0;
    const cursor = db.collection(COMMENTS).find().batchSize(500);
    for await (const comment of cursor) {
      checked += 1;
      if (comment.migrationQuarantineId === MIGRATION_ID) {
        const copy = await db.collection(QUARANTINE).findOne({ migrationId: MIGRATION_ID, originalId: comment._id });
        if (!copy || copy.checksum !== checksum(copy.beforeImage)) quarantineRowsMissing += 1;
        continue;
      }
      const parent = idFrom(comment.track_id)?.toHexString();
      if (!parent || !references.trackIds.has(parent)) invalidActiveParents += 1;
    }
    const quarantineCount = await db.collection(QUARANTINE).countDocuments({ migrationId: MIGRATION_ID });
    const markedCount = await db.collection(COMMENTS).countDocuments({ migrationQuarantineId: MIGRATION_ID });
    const commentIndexes = new Set((await db.collection(COMMENTS).listIndexes().toArray()).map(({ name }) => name));
    const quarantineIndexes = new Set((await db.collection(QUARANTINE).listIndexes().toArray()).map(({ name }) => name));
    const missingIndexes = CommentSchema.indexes()
      .filter(([, options]) => !options.name || !commentIndexes.has(options.name)).length +
      (quarantineIndexes.has('comment_quarantine_migration_original_unique') ? 0 : 1);
    return {
      checked,
      issueCount: invalidActiveParents + quarantineRowsMissing + Math.max(0, markedCount - quarantineCount) + missingIndexes,
      checksum: checksum({ checked, markedCount, quarantineCount, invalidActiveParents, missingIndexes }),
    };
  },
};
