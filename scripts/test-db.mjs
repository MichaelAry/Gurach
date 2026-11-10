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
const image = 'mongo@sha256:5d7043a4ffe02b9ed1b6e0bab057546981af5ca0a79107e9c461e49bc44c0a7b';
const databaseName = `gurach_test_${token}`;
const label = `gurach.test-run=${token}`;
const rootUser = 'gurach_test_root';
const rootPassword = randomBytes(36).toString('base64url');
const appUser = 'gurach_test_app';
const appPassword = randomBytes(36).toString('base64url');
let tempRoot;
let created = false;

function docker(args, { capture = false } = {}) {
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker ${args[0]} failed with status ${result.status ?? 'unknown'}`);
  }
  return capture ? result.stdout.trim() : '';
}

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

  const deadline = Date.now() + 90_000;
  let ready = false;
  const bootstrap = `
    const a=db.getSiblingDB('admin');
    const auth=a.auth(process.env.MONGO_INITDB_ROOT_USERNAME,process.env.MONGO_INITDB_ROOT_PASSWORD);
    if(auth!==1&&auth?.ok!==1)quit(21);
    try { const s=rs.status(); if(s.set==='rs0'&&s.myState===1)quit(0); }
    catch(e) { if(e.code===94||e.codeName==='NotYetInitialized') rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]}); else throw e; }
    quit(22);
  `;
  while (Date.now() < deadline) {
    const probe = spawnSync('docker', [
      'exec', containerName, 'mongosh', '--quiet', '--eval', bootstrap,
    ], { stdio: 'ignore' });
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Authenticated replica set did not become primary within 90 seconds');

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
} finally {
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
