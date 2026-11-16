import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'server');
const token = randomUUID().replaceAll('-', '');
const containerName = `gurach-test-${token.slice(0, 16)}`;
// MongoDB 8.3.17 includes SERVER-131779 (Ubuntu kernel/tcmalloc startup check).
const image = 'mongo@sha256:0f64db83d5926400d1cbcbaf35fbf2b0dfa6a4eaa71e04a26481a38cd803b27b';
const databaseName = `gurach_test_${token}`;
const label = `gurach.test-run=${token}`;
const rootUser = 'gurach_test_root';
const rootPassword = randomBytes(36).toString('base64url');
const appUser = 'gurach_test_app';
const appPassword = randomBytes(36).toString('base64url');
let tempRoot;
let created = false;
let startAttempted = false;

let stage = 'container-start';

// Only emit known messages/codes. Raw Docker/Mongo output can contain credentials,
// connection strings, or key material (including in nested log attributes).
function diagnostics(result) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const known = [
    'AuthenticationFailed', 'Unauthorized', 'NotYetInitialized',
    'NoReplicationEnabled', 'AlreadyInitialized', 'InvalidReplicaSetConfig',
    'ECONNREFUSED', 'ENOTFOUND', 'Permission denied', 'Operation not permitted',
    'No such file or directory', 'invalid char in key file',
    'security key in YAML file is invalid', 'Unable to acquire security key',
    'Cannot connect to the Docker daemon', 'OOM',
  ];
  const messages = known.filter((message) => output.includes(message));
  if (['ENOENT', 'EACCES', 'ETIMEDOUT', 'ENOBUFS'].includes(result.error?.code)) {
    messages.push(result.error.code);
  }
  // These are emitted by our probe/entrypoint, never arbitrary server text.
  messages.push(...(output.match(/gurach-mongo stage=[a-z-]+ exit=\d+/g) ?? []));
  messages.push(...(output.match(/mongo-code=\d+/g) ?? []));
  for (const line of output.split('\n')) {
    try {
      const log = JSON.parse(line);
      if (['E', 'F', 'W'].includes(log.s) && Number.isInteger(log.id)) {
        messages.push(`mongod severity=${log.s} id=${log.id}`);
        if (log.id === 12257600) messages.push('MongoDB kernel/tcmalloc incompatibility (SERVER-131779)');
      }
    } catch { /* Ignore non-JSON lines rather than exposing raw logs. */ }
  }
  return `exit=${result.status ?? 'unavailable'}${result.signal ? ` signal=${result.signal}` : ''}; ${messages.join(', ') || 'no allowlisted message'}`;
}

function invoke(args) {
  return spawnSync('docker', args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  });
}

function docker(args, { capture = false } = {}) {
  // Pull/start can exceed the short probe timeout, especially on a cold CI host.
  const result = spawnSync('docker', args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`[${stage}] docker ${args[0]}: ${diagnostics(result)}`);
  }
  return capture ? result.stdout.trim() : '';
}

function checkRunning() {
  const state = docker(['inspect', '--format', '{{json .State}}', containerName], { capture: true });
  const { Running, ExitCode, OOMKilled } = JSON.parse(state);
  if (!Running) throw new Error(`[${stage}] container stopped: exit=${ExitCode}; OOMKilled=${OOMKilled}`);
}

async function waitFor(nextStage, args) {
  stage = nextStage;
  console.log(`[mongo] ${stage}`);
  let last;
  while (Date.now() < bootstrapDeadline) {
    checkRunning();
    last = invoke(args);
    if (last.status === 0) return;
    // mongosh can fail to connect before --eval executes, just after PID 1
    // becomes mongod and before the socket opens. It uses exit 1 in that case.
    const connecting = nextStage === 'mongosh-auth' && last.status === 1 &&
      /^MongoNetworkError: connect ECONNREFUSED\b/m.test(`${last.stdout}\n${last.stderr}`);
    // Only explicitly transient probe results are retried.
    if (last.error || (![22, 23].includes(last.status) && !connecting)) {
      throw new Error(`[${stage}] ${diagnostics(last)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`[${stage}] bootstrap deadline (90 seconds): ${diagnostics(last ?? {})}`);
}

const auth = `
  const a=db.getSiblingDB('admin');
  const auth=a.auth(process.env.MONGO_INITDB_ROOT_USERNAME,process.env.MONGO_INITDB_ROOT_PASSWORD);
  if(auth!==1&&auth?.ok!==1)quit(21);
`;
function mongoProbe(script) {
  return ['exec', containerName, 'mongosh', '--quiet', '--host', '127.0.0.1', '--port', '27017', '--eval', `
    try { ${auth} ${script} }
    catch(e) {
      if(Number.isInteger(e.code))print('mongo-code='+e.code);
      const names=['AuthenticationFailed','Unauthorized','NotYetInitialized','NoReplicationEnabled','AlreadyInitialized','InvalidReplicaSetConfig'];
      if(names.includes(e.codeName))print(e.codeName);
      if(e.name==='MongoNetworkError'){ print('ECONNREFUSED'); quit(23); }
      quit(24);
    }
  `];
}
let bootstrapDeadline;

try {
  const collision = spawnSync('docker', ['inspect', containerName], { stdio: 'ignore' });
  if (collision.status === 0) throw new Error('Generated test container name already exists; refusing to touch it');

  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'gurach-test-db-'));
  await chmod(tempRoot, 0o700);
  const envFile = path.join(tempRoot, 'mongo.env');
  const keyFile = path.join(tempRoot, 'keyfile');
  const env = {
    MONGO_INITDB_ROOT_USERNAME: rootUser,
    MONGO_INITDB_ROOT_PASSWORD: rootPassword,
    MONGO_INITDB_DATABASE: databaseName,
    MONGO_APP_USERNAME: appUser,
    MONGO_APP_PASSWORD: appPassword,
    MONGO_APP_DATABASE: databaseName,
  };
  await writeFile(envFile, `${Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')}\n`, { flag: 'wx', mode: 0o600 });
  await writeFile(keyFile, `${randomBytes(768).toString('base64').replace(/=+$/, '')}\n`, { flag: 'wx', mode: 0o600 });
  await chmod(envFile, 0o600);
  await chmod(keyFile, 0o600);

  console.log('[mongo] container-start');
  startAttempted = true;
  docker([
    'run', '-d', '--name', containerName, '--label', label,
    '--env-file', envFile,
    '--volume', `${keyFile}:/run/mongo-keyfile:ro`,
    '--volume', `${path.join(root, 'docker/mongo/entrypoint.sh')}:/opt/mongo-entrypoint.sh:ro`,
    '--volume', `${path.join(root, 'docker/mongo/01-create-app-user.js')}:/docker-entrypoint-initdb.d/10-create-app-user.js:ro`,
    '--entrypoint', '/bin/bash',
    '-p', '127.0.0.1::27017', image,
    '/opt/mongo-entrypoint.sh', 'mongod', '--bind_ip_all', '--replSet', 'rs0',
  ], { capture: true });
  created = true;

  const binding = docker(['port', containerName, '27017/tcp'], { capture: true });
  const match = binding.match(/^127\.0\.0\.1:(\d+)$/m);
  if (!match) throw new Error('Disposable Mongo did not bind to a loopback host port');
  const port = match[1];

  bootstrapDeadline = Date.now() + 90_000;
  checkRunning();
  await waitFor('keyfile', ['exec', containerName, 'bash', '-c', `
    test -s /tmp/mongo-keyfile || exit 22
    test "$(stat -c '%U:%G:%a' /tmp/mongo-keyfile)" = mongodb:mongodb:400 || exit 25
    gosu mongodb test -r /tmp/mongo-keyfile || exit 26
  `]);
  // The official entrypoint runs a temporary standalone mongod for initdb.
  // PID 1 becomes mongod only AFTER init scripts and its shutdown finish.
  await waitFor('init-complete', ['exec', containerName, 'bash', '-c', `
    test "$(cat /proc/1/comm)" = mongod || exit 22
  `]);
  await waitFor('mongosh-auth', mongoProbe('quit(0);'));
  await waitFor('rs-initiate', mongoProbe(`
    try { const s=rs.status(); if(s.set!=='rs0')quit(27); }
    catch(e) {
      if(e.code!==94)throw e;
      const result=rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]});
      if(result.ok!==1)quit(28);
    }
    quit(0);
  `));
  await waitFor('primary', mongoProbe(`
    const s=rs.status();
    if(s.set!=='rs0')quit(27);
    quit(s.myState===1 ? 0 : 22);
  `));
  console.log('[mongo] authenticated rs0 primary ready');

  const uri = new URL(`mongodb://${encodeURIComponent(appUser)}:${encodeURIComponent(appPassword)}@127.0.0.1:${port}/${databaseName}`);
  uri.searchParams.set('authSource', databaseName);
  uri.searchParams.set('replicaSet', 'rs0');
  uri.searchParams.set('directConnection', 'true');
  const rootUri = new URL(`mongodb://${encodeURIComponent(rootUser)}:${encodeURIComponent(rootPassword)}@127.0.0.1:${port}/${databaseName}`);
  rootUri.searchParams.set('authSource', 'admin');
  rootUri.searchParams.set('replicaSet', 'rs0');
  rootUri.searchParams.set('directConnection', 'true');
  const internalRootUri = new URL(rootUri.toString());
  internalRootUri.hostname = 'localhost';
  internalRootUri.port = '27017';
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const integration = spawnSync(npm, ['run', 'test:integration'], {
    cwd: serverDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      MONGODB_URI: uri.toString(),
      MONGO_TEST_CONTAINER: containerName,
      MONGO_TEST_ROOT_URI: rootUri.toString(),
      MONGO_TEST_INTERNAL_ROOT_URI: internalRootUri.toString(),
      MAINTENANCE_POLL_INTERVAL_MS: '60000',
      CACHE_EVENT_URL: 'http://cache-callback.invalid/api/internal/cache-events',
      CACHE_EVENT_SECRET: randomBytes(48).toString('base64url'),
    },
  });
  if (integration.error) throw integration.error;
  if (integration.status !== 0) process.exitCode = integration.status ?? 1;
} catch (error) {
  // A failed docker run may still have created a stopped container.
  if (startAttempted && !created) {
    const ownership = invoke(['inspect', '--format', '{{ index .Config.Labels "gurach.test-run" }}', containerName]);
    created = ownership.status === 0 && ownership.stdout.trim() === token;
  }
  console.error(error.message);
  if (created) {
    const logs = invoke(['logs', '--tail', '100', containerName]);
    console.error(`[${stage}] filtered container logs: ${diagnostics(logs)}`);
  }
  process.exitCode = 1;
} finally {
  stage = 'cleanup';
  if (created) {
    const actualLabel = docker([
      'inspect', '--format', '{{ index .Config.Labels "gurach.test-run" }}', containerName,
    ], { capture: true });
    if (actualLabel !== token) throw new Error('Test container ownership label changed; refusing to remove it');
    docker(['rm', '-f', containerName]);
  }
  if (tempRoot) {
    const allowedRoot = `${os.tmpdir()}${path.sep}gurach-test-db-`;
    if (!tempRoot.startsWith(allowedRoot)) throw new Error('Refusing cleanup outside allocated test temp root');
    await rm(tempRoot, { recursive: true, force: true });
  }
}
