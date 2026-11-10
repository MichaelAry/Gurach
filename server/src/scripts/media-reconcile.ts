import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, MongoError, type Db } from 'mongodb';
import { env } from '../common/env.js';
import { redactSecrets } from '../common/env-validation.js';
import { assertSafeApplyTarget, createTargetFingerprint, getMongoUri, validateDatabaseName } from './lib/migration-context.js';

const GRACE_MS = 24 * 60 * 60 * 1000;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const EXTENSIONS = {
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac'],
  picture: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'],
} as const;

type Args = { database: string; report: string; apply: boolean; expectedFingerprint?: string };
type Candidate = { kind: 'audio' | 'picture'; name: string; size: number; modifiedAt: string; reason: string };

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') { if (apply) throw new Error('--apply supplied more than once'); apply = true; continue; }
    const split = arg.indexOf('=');
    const key = split < 0 ? arg : arg.slice(0, split);
    if (!['--database', '--report', '--expected-fingerprint'].includes(key)) throw new Error(`Unknown option: ${key}`);
    if (values.has(key)) throw new Error(`${key} supplied more than once`);
    const value = split < 0 ? argv[++i] : arg.slice(split + 1);
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`);
    values.set(key, value);
  }
  const database = values.get('--database');
  const report = values.get('--report');
  const expectedFingerprint = values.get('--expected-fingerprint');
  if (!database || !report) throw new Error('Usage: media:reconcile --database gurach_test_<name> --report .local/migration-private/<new-file.json> [--apply --expected-fingerprint <sha256>]');
  validateDatabaseName(database);
  if (apply && (!expectedFingerprint || !/^[a-f0-9]{64}$/.test(expectedFingerprint))) throw new Error('--apply requires --expected-fingerprint from a reviewed dry-run report');
  if (!apply && expectedFingerprint) throw new Error('--expected-fingerprint is valid only with --apply');
  return { database, report, apply, ...(expectedFingerprint ? { expectedFingerprint } : {}) };
}

function validKey(kind: keyof typeof EXTENSIONS, name: string): boolean {
  return EXTENSIONS[kind].some((ext) => new RegExp(`^${UUID}\\.${ext}$`).test(name));
}

async function inventory(db: Db, staticRoot: string, stagingRoot: string) {
  const tracks = await db.collection('tracks').find({}, { projection: { _id: 1, audio: 1, picture: 1, lifecycle: 1 } }).toArray();
  const operations = await db.collection('mediaoperations').find({}, { projection: { operationId: 1, kind: 1, state: 1, audioKey: 1, pictureKey: 1, stageDirectory: 1, leaseUntil: 1, createdAt: 1 } }).toArray();
  const refs = new Map<string, { active: number; other: number; operations: number }>();
  const add = (name: unknown, bucket: 'active' | 'other' | 'operations') => {
    if (typeof name !== 'string') return;
    const count = refs.get(name) ?? { active: 0, other: 0, operations: 0 };
    count[bucket] += 1;
    refs.set(name, count);
  };
  for (const track of tracks) for (const field of ['audio', 'picture']) add(track[field], track.lifecycle === 'active' || track.lifecycle === undefined ? 'active' : 'other');
  for (const op of operations) if (op.state !== 'done') { add(op.audioKey, 'operations'); add(op.pictureKey, 'operations'); }
  const missing: { trackId: string; kind: string; key: string }[] = [];
  const allocatedButUnpublished: { operationId: string; kind: string; key: string; state: string }[] = [];
  const files: Candidate[] = [];
  const temporaryPublishFiles: { kind: 'audio' | 'picture'; name: string; size: number; modifiedAt: string }[] = [];
  const publicEntries: { kind: 'audio' | 'picture'; name: string; size: number; modifiedAt: string; regular: boolean }[] = [];
  const now = Date.now();
  for (const kind of ['audio', 'picture'] as const) {
    const dir = path.join(staticRoot, kind);
    let names: string[];
    try {
      const ds = await lstat(dir);
      if (!ds.isDirectory() || ds.isSymbolicLink()) throw new Error(`Public ${kind} directory is not a real directory`);
      names = await readdir(dir);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') names = []; else throw error; }
    for (const name of names) {
      if (/^\.pending-[0-9a-f-]{36}\.upload$/.test(name)) {
        const pendingPath = path.join(dir, name);
        const pendingStats = await lstat(pendingPath);
        if (pendingStats.isFile() && !pendingStats.isSymbolicLink()) temporaryPublishFiles.push({ kind, name, size: pendingStats.size, modifiedAt: pendingStats.mtime.toISOString() });
        continue;
      }
      if (!validKey(kind, name)) continue;
      const full = path.join(dir, name);
      const fs = await lstat(full);
      if (!fs.isFile() || fs.isSymbolicLink()) continue;
      const entry = { kind, name, size: fs.size, modifiedAt: fs.mtime.toISOString(), regular: true };
      publicEntries.push(entry);
      const ref = refs.get(name);
      if (!ref || (!ref.active && !ref.operations)) {
        if (now - fs.mtimeMs >= GRACE_MS) files.push({ kind, name, size: fs.size, modifiedAt: entry.modifiedAt, reason: ref?.other ? 'deleted-track-reference-only' : 'unreferenced-over-24h' });
      }
    }
  }
  for (const track of tracks) {
    if (track.lifecycle !== 'active' && track.lifecycle !== undefined) continue;
    for (const kind of ['audio', 'picture'] as const) {
      const key = track[kind];
      if (typeof key === 'string' && validKey(kind, key) && !publicEntries.some((entry) => entry.kind === kind && entry.name === key)) {
        missing.push({ trackId: String(track._id), kind, key });
      }
    }
  }
  const publicKeySet = new Set(publicEntries.map((entry) => `${entry.kind}:${entry.name}`));
  for (const op of operations) {
    if (op.state === 'done') continue;
    for (const kind of ['audio', 'picture'] as const) {
      const key = op[kind === 'audio' ? 'audioKey' : 'pictureKey'];
      if (typeof key === 'string' && validKey(kind, key) && !publicKeySet.has(`${kind}:${key}`)) {
        allocatedButUnpublished.push({ operationId: String(op.operationId), kind, key, state: String(op.state) });
      }
    }
  }
  const staging: { operationId: string; ageMs: number; manifest: string }[] = [];
  try {
    const root = await lstat(stagingRoot);
    if (root.isDirectory() && !root.isSymbolicLink()) {
      for (const operationId of await readdir(stagingRoot)) {
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(operationId) || operationId === '.' || operationId === '..') continue;
        const dir = path.join(stagingRoot, operationId);
        const ds = await lstat(dir);
        if (!ds.isDirectory() || ds.isSymbolicLink()) continue;
        let manifest = 'missing-or-invalid';
        try {
          const mf = await lstat(path.join(dir, 'operation.json'));
          if (mf.isFile() && !mf.isSymbolicLink() && mf.size <= 4096) {
            const manifestHandle = await open(path.join(dir, 'operation.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
            let content: string;
            try { content = await manifestHandle.readFile('utf8'); } finally { await manifestHandle.close(); }
            const parsed = JSON.parse(content) as { operationId?: string; createdAt?: string; state?: string };
            if (parsed.operationId === operationId && typeof parsed.createdAt === 'string' && Number.isFinite(Date.parse(parsed.createdAt))) manifest = parsed.state ?? 'unknown';
          }
        } catch { /* reported as ambiguous; never apply to staging in this tool */ }
        staging.push({ operationId, ageMs: Math.max(0, now - ds.mtimeMs), manifest });
      }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return {
    generatedAt: new Date(now).toISOString(), graceHours: 24,
    counts: { tracks: tracks.length, operations: operations.length, publicFiles: publicEntries.length, orphanCandidates: files.length, temporaryPublishFiles: temporaryPublishFiles.length, activeMissingMedia: missing.length, allocatedButUnpublished: allocatedButUnpublished.length, stagingOperations: staging.length },
    sharedKeys: [...refs.entries()].filter(([, count]) => count.active + count.other + count.operations > 1).map(([key, count]) => ({ key, ...count })),
    activeMissingMedia: missing,
    allocatedButUnpublished,
    temporaryPublishFiles,
    operations: operations.map((op) => ({ operationId: op.operationId, kind: op.kind, state: op.state, leaseActive: op.leaseUntil instanceof Date && op.leaseUntil > new Date(now), createdAt: op.createdAt ?? null })),
    staging,
    orphanCandidates: files,
  };
}

async function ensurePrivateDir(dir: string): Promise<void> {
  try { await mkdir(dir, { recursive: false, mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  const s = await lstat(dir);
  if (!s.isDirectory() || s.isSymbolicLink() || (s.mode & 0o077) !== 0) throw new Error('Private report/quarantine directory must be owner-only and cannot be a symlink');
}

async function privateReportPath(raw: string): Promise<string> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const privateDir = path.join(root, '.local', 'migration-private');
  await ensurePrivateDir(path.join(root, '.local'));
  await ensurePrivateDir(privateDir);
  const dest = path.resolve(root, raw);
  if (path.dirname(dest) !== privateDir || await realpath(path.dirname(dest)) !== await realpath(privateDir)) throw new Error('--report must be directly inside .local/migration-private');
  return dest;
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function quarantine(db: Db, staticRoot: string, reportRoot: string, candidates: Candidate[], expectedFingerprint: string): Promise<unknown[]> {
  const quarantineRoot = path.join(reportRoot, 'media-quarantine');
  await ensurePrivateDir(quarantineRoot);
  const runDir = path.join(quarantineRoot, `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`);
  await mkdir(runDir, { mode: 0o700 });
  const outcomes: unknown[] = [];
  const journalPath = path.join(runDir, 'restore-manifest.ndjson');
  const journal = await open(journalPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const record = async (event: Record<string, unknown>) => {
    await journal.writeFile(`${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
    await journal.sync();
  };
  for (const candidate of candidates) {
    const liveTrackRefs = await db.collection('tracks').countDocuments({ lifecycle: { $ne: 'deleted' }, [candidate.kind]: candidate.name });
    const pendingOperationRefs = await db.collection('mediaoperations').countDocuments({ state: { $ne: 'done' }, [candidate.kind === 'audio' ? 'audioKey' : 'pictureKey']: candidate.name });
    const allTrackRefs = await db.collection('tracks').countDocuments({ [candidate.kind]: candidate.name });
    if (liveTrackRefs || pendingOperationRefs || allTrackRefs > 1) {
      const outcome = { kind: candidate.kind, name: candidate.name, result: 'skipped-now-referenced' };
      outcomes.push(outcome); await record(outcome); continue;
    }
    const src = path.join(staticRoot, candidate.kind, candidate.name);
    const s = await lstat(src).catch(() => undefined);
    if (!s || !s.isFile() || s.isSymbolicLink() || s.size !== candidate.size || s.mtime.toISOString() !== candidate.modifiedAt) {
      const outcome = { kind: candidate.kind, name: candidate.name, result: 'skipped-changed-since-audit' };
      outcomes.push(outcome); await record(outcome); continue;
    }
    const destination = path.join(runDir, `${candidate.kind}-${candidate.name}`);
    const source = await open(src, constants.O_RDONLY | constants.O_NOFOLLOW);
    const dest = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      const input = source.createReadStream({ autoClose: false });
      const output = dest.createWriteStream({ autoClose: false });
      await new Promise<void>((resolve, reject) => {
        input.on('error', reject); output.on('error', reject); output.on('finish', resolve); input.pipe(output);
      });
      await dest.sync();
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      throw error;
    } finally { await source.close(); await dest.close(); }
    const out = await open(destination, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { await out.sync(); } finally { await out.close(); }
    const copied = await stat(destination);
    if (copied.size !== s.size) { await unlink(destination); const outcome = { kind: candidate.kind, name: candidate.name, result: 'copy-verification-failed' }; outcomes.push(outcome); await record(outcome); continue; }
    const digest = createHash('sha256');
    const handle = await open(src, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { for await (const chunk of handle.createReadStream()) digest.update(chunk); } finally { await handle.close().catch(() => undefined); }
    const copiedHash = createHash('sha256');
    const copyHandle = await open(destination, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { for await (const chunk of copyHandle.createReadStream()) copiedHash.update(chunk); } finally { await copyHandle.close().catch(() => undefined); }
    const sourceDigest = digest.digest('hex');
    const quarantineDigest = copiedHash.digest('hex');
    if (sourceDigest !== quarantineDigest) { await unlink(destination); const outcome = { kind: candidate.kind, name: candidate.name, result: 'hash-verification-failed' }; outcomes.push(outcome); await record(outcome); continue; }
    const finalLiveRefs = await db.collection('tracks').countDocuments({ lifecycle: { $ne: 'deleted' }, [candidate.kind]: candidate.name });
    const finalPendingRefs = await db.collection('mediaoperations').countDocuments({ state: { $ne: 'done' }, [candidate.kind === 'audio' ? 'audioKey' : 'pictureKey']: candidate.name });
    const finalStat = await lstat(src).catch(() => undefined);
    if (finalLiveRefs || finalPendingRefs || !finalStat?.isFile() || finalStat.isSymbolicLink() || finalStat.size !== s.size || finalStat.mtime.toISOString() !== candidate.modifiedAt) {
      await unlink(destination);
      const outcome = { kind: candidate.kind, name: candidate.name, result: 'skipped-changed-or-referenced' };
      outcomes.push(outcome); await record(outcome); continue;
    }
    await record({ kind: candidate.kind, name: candidate.name, quarantinedAs: path.basename(destination), size: s.size, sha256: quarantineDigest, result: 'verified-copy-ready-to-move' });
    await unlink(src);
    const outcome = { kind: candidate.kind, name: candidate.name, quarantinedAs: path.basename(destination), size: s.size, sha256: quarantineDigest, result: 'quarantined' };
    outcomes.push(outcome); await record(outcome);
  }
  await journal.close();
  await writeFile(path.join(runDir, 'restore-manifest.json'), `${JSON.stringify({ createdAt: new Date().toISOString(), expectedFingerprint, files: outcomes }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return outcomes;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = getMongoUri();
  const client = new MongoClient(uri, { appName: 'gurach-media-reconciliation', serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    const hello = await client.db('admin').command({ hello: 1 });
    const fingerprint = createTargetFingerprint(args.database, hello);
    if (args.apply) {
      assertSafeApplyTarget(args.database);
      if (fingerprint !== args.expectedFingerprint) throw new Error('Mongo target fingerprint changed since dry-run; refusing apply');
    }
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const destination = await privateReportPath(args.report);
    const staticRoot = env.staticDir;
    const stagingRoot = env.mediaStagingDir;
    const staticReal = await realpath(staticRoot);
    const stagingReal = await realpath(stagingRoot).catch(() => stagingRoot);
    if (stagingReal === staticReal || stagingReal.startsWith(`${staticReal}${path.sep}`)) throw new Error('Staging root resolves inside public static root');
    const privateReal = await realpath(path.dirname(destination));
    if (isWithin(staticReal, privateReal) || isWithin(staticReal, path.join(root, '.local', 'media-quarantine'))) {
      throw new Error('Private reports and quarantine must resolve outside the public static root');
    }
    const result = await inventory(client.db(args.database), staticReal, stagingReal);
    const report: Record<string, unknown> = { command: 'media:reconcile', database: args.database, targetFingerprint: fingerprint, mode: args.apply ? 'apply' : 'dry-run', ...result };
    if (args.apply) {
      const candidates = result.orphanCandidates as Candidate[];
      // Reserve the private report before any filesystem mutation so a crash leaves evidence.
      await writeFile(destination, `${JSON.stringify({ ...report, quarantineResults: 'apply-in-progress' }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      report.quarantineResults = await quarantine(client.db(args.database), staticReal, path.join(root, '.local'), candidates, fingerprint);
      await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, { flag: 'w', mode: 0o600 });
    } else {
      await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    }
    process.stdout.write(`${JSON.stringify({ command: 'media:reconcile', database: args.database, targetFingerprint: fingerprint, mode: args.apply ? 'apply' : 'dry-run', report: path.relative(root, destination), counts: result.counts }, null, 2)}\n`);
  } finally { await client.close(); }
}

void main().catch((error: unknown) => {
  const message = error instanceof MongoError ? 'MongoDB operation failed; no document values were printed.' : error instanceof Error ? error.message : 'Media reconciliation failed';
  process.stderr.write(`${redactSecrets(message)}\n`);
  process.exitCode = 1;
});
