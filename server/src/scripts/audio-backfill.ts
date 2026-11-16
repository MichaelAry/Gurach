import { constants, createReadStream } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { MongoClient, MongoError } from 'mongodb';
import { env } from '../common/env.js';
import { AudioFingerprintService, AUDIO_FINGERPRINT_VERSION, CHROMAPRINT_VERSION, similarAudio, type AudioFingerprints } from '../file/audio-fingerprint.service.js';
import { FileService, FileType } from '../file/file.service.js';
import { AUDIO_EXACT_INDEXES, isAudioExactIndex } from '../track/schemas/track.schema.js';
import { assertSafeApplyTarget, createTargetFingerprint, getMongoUri, validateDatabaseName } from './lib/migration-context.js';

// Both source and .tools output resolve reports against the repository root.
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory,
  path.basename(path.resolve(scriptDirectory, '../..')) === '.tools' ? '../../../..' : '../../..');
function reportPath(value: string): string {
  const directory = path.join(workspaceRoot, '.local', 'migration-private');
  const destination = path.resolve(workspaceRoot, value);
  if (path.dirname(destination) !== directory) throw new Error('Report must be directly inside .local/migration-private');
  return destination;
}

function argumentsForRun(argv: string[]) {
  const values = new Map<string, string>();
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply' && !apply) { apply = true; continue; }
    if (!['--database', '--report', '--expected-fingerprint'].includes(argv[i]) || values.has(argv[i])) throw new Error('Invalid or repeated backfill option');
    const key = argv[i];
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('Missing backfill option value');
    values.set(key, value);
  }
  const database = values.get('--database');
  const report = values.get('--report');
  const expected = values.get('--expected-fingerprint');
  if (!database || !report) throw new Error('Usage: audio:backfill --database <name> --report .local/migration-private/<new-name.jsonl> [--apply --expected-fingerprint <sha256>]');
  validateDatabaseName(database);
  if (apply) {
    assertSafeApplyTarget(database);
    if (!expected || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('--apply requires the targetFingerprint from a reviewed dry-run');
  }
  return { database, destination: reportPath(report), expected, apply };
}

async function privateReports(destination: string) {
  const directory = path.dirname(reportPath('.local/migration-private/placeholder'));
  if (path.dirname(destination) !== directory) throw new Error('Report must be directly inside .local/migration-private');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o077) !== 0
    || stats.uid !== process.getuid?.() || await realpath(directory) !== directory) throw new Error('Report directory must be private, owned by the current user and contain no symlinks');
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
  const report = await open(destination, flags, 0o600);
  try {
    const spoolPath = `${destination}.fingerprints.jsonl`;
    const spool = await open(spoolPath, flags, 0o600);
    return { report, spool, spoolPath };
  } catch (error) { await report.close(); throw error; }
}

type Snapshot = { id: string; prints: AudioFingerprints };
async function* snapshots(filePath: string) {
  const input = createReadStream(filePath);
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) if (line) yield JSON.parse(line) as Snapshot;
  } finally { lines.close(); input.destroy(); }
}

async function main() {
  const args = argumentsForRun(process.argv.slice(2));
  const client = new MongoClient(getMongoUri(), { appName: 'gurach-audio-backfill', serverSelectionTimeoutMS: 10_000 });
  const files = new FileService();
  const fingerprints = new AudioFingerprintService();
  try {
    await client.connect();
    const db = client.db(args.database);
    const targetFingerprint = createTargetFingerprint(args.database, await client.db('admin').command({ hello: 1 }));
    if (args.apply && targetFingerprint !== args.expected) throw new Error('Target differs from reviewed dry-run');
    if (args.apply) {
      const indexes = await db.collection('tracks').listIndexes().toArray();
      if (!AUDIO_EXACT_INDEXES.every((definition) => indexes.some((index) => isAudioExactIndex(index, definition)))) throw new Error('Install migration 009-audio-fingerprint-indexes before applying backfill');
    }
    const root = await realpath(env.staticDir);
    const audioRoot = path.join(root, 'audio');
    if (await realpath(path.join(env.staticDir, 'audio')) !== audioRoot) throw new Error('Audio directory must resolve directly inside STATIC_DIR');
    const { report, spool, spoolPath } = await privateReports(args.destination);
    const record = async (value: unknown) => { await report.write(`${JSON.stringify(value)}\n`); await report.sync(); };
    const counts = { checked: 0, applied: 0, resumed: 0, missing: 0, failed: 0, collisions: 0, changed: 0 };
    try {
      await record({ command: 'audio:backfill', database: args.database, targetFingerprint, mode: args.apply ? 'apply' : 'dry-run', version: AUDIO_FINGERPRINT_VERSION });
      const cursor = db.collection('tracks').find({ lifecycle: 'active' }).sort({ _id: 1 }).batchSize(10);
      try {
        for await (const row of cursor) {
          counts.checked += 1;
          const id = String(row._id);
          let filePath: string;
          try { filePath = files.resolveStoredPath(row.audio as string, FileType.AUDIO); }
          catch { counts.failed += 1; await record({ id, outcome: 'invalid-audio-key' }); continue; }
          const stats = await lstat(filePath).catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
          });
          if (!stats) { counts.missing += 1; await record({ id, outcome: 'missing-file' }); continue; }
          if (!stats.isFile() || stats.isSymbolicLink()) { counts.failed += 1; await record({ id, outcome: 'not-a-regular-file' }); continue; }
          const complete = typeof row.fileSha256 === 'string' && /^[a-f0-9]{64}$/.test(row.fileSha256)
            && typeof row.pcmSha256 === 'string' && row.pcmSha256.startsWith(`${AUDIO_FINGERPRINT_VERSION}:`)
            && /^[a-f0-9]{64}$/.test(row.pcmSha256.slice(AUDIO_FINGERPRINT_VERSION.length + 1))
            && row.audioFingerprint?.version === AUDIO_FINGERPRINT_VERSION
            && row.audioFingerprint?.chromaprintVersion === CHROMAPRINT_VERSION;
          let prints: AudioFingerprints;
          try {
            prints = complete ? { fileSha256: row.fileSha256 as string, pcmSha256: row.pcmSha256 as string, audioFingerprint: row.audioFingerprint as AudioFingerprints['audioFingerprint'] }
              : await fingerprints.compute(filePath);
          } catch {
            counts.failed += 1; await record({ id, outcome: 'fingerprinting-failed', hint: 'Check file validity and local fingerprint tool installation/limits' }); continue;
          }
          const after = await lstat(filePath).catch(() => null);
          if (!after || after.ino !== stats.ino || after.size !== stats.size || after.mtimeMs !== stats.mtimeMs || after.ctimeMs !== stats.ctimeMs) {
            counts.changed += 1; await record({ id, outcome: 'file-changed-retry' }); continue;
          }
          let exactCollision = false;
          // Disk spool bounds memory even for a large catalogue and includes rows
          // that cannot be backfilled due to an exact collision. Dry-run writes no DB data.
          for await (const prior of snapshots(spoolPath)) {
            const reasons: string[] = [];
            if (prints.fileSha256 === prior.prints.fileSha256) reasons.push('file_sha256');
            if (prints.pcmSha256 === prior.prints.pcmSha256) reasons.push('decoded_audio_sha256');
            if (reasons.length) exactCollision = true;
            else if (similarAudio(prints.audioFingerprint, prior.prints.audioFingerprint)) reasons.push('chromaprint');
            if (reasons.length) { counts.collisions += 1; await record({ outcome: 'collision', trackIds: [prior.id, id], reasons }); }
          }
          await spool.write(`${JSON.stringify({ id, prints })}\n`);
          if (complete) { counts.resumed += 1; await record({ id, outcome: 'already-complete' }); continue; }
          if (exactCollision || !args.apply) { await record({ id, outcome: exactCollision ? 'blocked-exact-collision' : 'would-backfill' }); continue; }
          try {
            const result = await db.collection('tracks').updateOne({ _id: row._id, lifecycle: 'active', audio: row.audio,
              fileSha256: Object.hasOwn(row, 'fileSha256') ? row.fileSha256 : { $exists: false },
              pcmSha256: Object.hasOwn(row, 'pcmSha256') ? row.pcmSha256 : { $exists: false },
              audioFingerprint: Object.hasOwn(row, 'audioFingerprint') ? row.audioFingerprint : { $exists: false },
            }, { $set: prints });
            if (result.matchedCount === 1) { counts.applied += 1; await record({ id, outcome: 'backfilled' }); }
            else { counts.changed += 1; await record({ id, outcome: 'row-changed-retry' }); }
          } catch (error) {
            if (!(error instanceof MongoError) || error.code !== 11000) throw error;
            const winners = await db.collection('tracks').find({ lifecycle: 'active', _id: { $ne: row._id },
              $or: [{ fileSha256: prints.fileSha256 }, { pcmSha256: prints.pcmSha256 }],
            }).project({ _id: 1 }).toArray();
            counts.collisions += 1; await record({ id, trackIds: [id, ...winners.map((winner) => String(winner._id))], outcome: 'concurrent-exact-collision-retry' });
          }
        }
      } finally { await cursor.close(); }
      await record({ outcome: 'summary', counts });
      process.stdout.write(`${JSON.stringify({ targetFingerprint, mode: args.apply ? 'apply' : 'dry-run', counts })}\n`);
      if (counts.missing || counts.failed || counts.collisions || counts.changed) process.exitCode = 2;
    } finally { await report.close(); await spool.close(); }
  } finally { await client.close(); }
}

void main().catch(() => {
  // Raw Mongo errors may contain credentials, paths or document values.
  process.stderr.write('Audio backfill failed. Check CLI options, isolated target, indexes, private report permissions and local tools; see the private report for completed rows.\n');
  process.exitCode = 1;
});
