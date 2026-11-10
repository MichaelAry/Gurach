import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privateDir = path.join(root, '.local', 'mongo');
const composeFile = path.join(root, 'docker-compose.dev.yml');
const envFile = path.join(privateDir, 'dev.env');
const appEnvFile = path.join(privateDir, 'app.env');
const keyFile = path.join(privateDir, 'keyfile');
const restoreConfig = path.join(privateDir, 'restore.yml');
const containerName = 'gurach-dev-mongodb';
const composeProject = 'gurach-devdb';
const databaseName = 'gurach';
const mongoPort = '27028';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`);
  }
  return result;
}

function parseEnv(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2];
    if (value.startsWith('"')) value = JSON.parse(value);
    values[match[1]] = value;
  }
  return values;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function createPrivateFiles() {
  await mkdir(privateDir, { recursive: true, mode: 0o700 });
  const existing = await Promise.all(
    [envFile, appEnvFile, keyFile, restoreConfig].map(exists),
  );
  if (existing.some(Boolean) && !existing.every(Boolean)) {
    throw new Error(
      `Private Mongo files are incomplete under ${privateDir}; refusing to replace developer values`,
    );
  }
  if (existing.every(Boolean)) return;

  const rootPassword = randomBytes(36).toString('base64url');
  const appPassword = randomBytes(36).toString('base64url');
  const values = {
    MONGO_PORT: mongoPort,
    MONGO_ROOT_USERNAME: 'gurach_root',
    MONGO_ROOT_PASSWORD: rootPassword,
    MONGO_APP_USERNAME: 'gurach_app',
    MONGO_APP_PASSWORD: appPassword,
    MONGO_APP_DATABASE: databaseName,
  };
  const appUri = new URL(`mongodb://${values.MONGO_APP_USERNAME}:${appPassword}@127.0.0.1:${mongoPort}/${databaseName}`);
  appUri.searchParams.set('authSource', databaseName);
  appUri.searchParams.set('replicaSet', 'rs0');
  appUri.searchParams.set('directConnection', 'true');
  const restoreUri = new URL(appUri.toString());
  restoreUri.port = '27017';
  const key = randomBytes(768).toString('base64').replace(/=+$/, '');

  try {
    await writeFile(
      envFile,
      `${Object.entries(values).map(([name, value]) => `${name}=${value}`).join('\n')}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    await writeFile(appEnvFile, `MONGODB_URI=${JSON.stringify(appUri.toString())}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    await writeFile(keyFile, `${key}\n`, { flag: 'wx', mode: 0o600 });
    await chmod(keyFile, 0o600);
    await writeFile(restoreConfig, `uri: ${JSON.stringify(restoreUri.toString())}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    throw new Error(`Could not create private Mongo configuration; keep existing files and inspect ${privateDir}`, { cause: error });
  }
}

async function loadPrivateEnv() {
  await createPrivateFiles();
  const values = parseEnv(await readFile(envFile, 'utf8'));
  const app = parseEnv(await readFile(appEnvFile, 'utf8'));
  const required = [
    'MONGO_PORT',
    'MONGO_ROOT_USERNAME',
    'MONGO_ROOT_PASSWORD',
    'MONGO_APP_USERNAME',
    'MONGO_APP_PASSWORD',
    'MONGO_APP_DATABASE',
  ];
  if (required.some((name) => !values[name]) || !app.MONGODB_URI) {
    throw new Error('Private Mongo configuration is incomplete; refusing to regenerate it');
  }
  if (values.MONGO_APP_DATABASE !== databaseName || values.MONGO_PORT !== mongoPort) {
    throw new Error('Private Mongo config does not match the pinned local topology');
  }
  const restoreText = await readFile(restoreConfig, 'utf8');
  const restoreUri = new URL(app.MONGODB_URI);
  restoreUri.port = '27017';
  const expectedRestore = `uri: ${JSON.stringify(restoreUri.toString())}\n`;
  const previousGeneratedRestore = `uri: ${JSON.stringify(app.MONGODB_URI)}\n`;
  if (restoreText !== expectedRestore) {
    if (restoreText !== previousGeneratedRestore) {
      throw new Error('Private restore config differs from the generated topology; refusing to overwrite it');
    }
    const temporary = `${restoreConfig}.tmp`;
    await writeFile(temporary, expectedRestore, { flag: 'wx', mode: 0o600 });
    await rename(temporary, restoreConfig);
  }
  const mode = (await stat(privateDir)).mode & 0o777;
  if ((mode & 0o077) !== 0) await chmod(privateDir, 0o700);
  for (const file of [envFile, appEnvFile, keyFile, restoreConfig]) {
    const fileMode = (await stat(file)).mode & 0o777;
    if ((fileMode & 0o077) !== 0) await chmod(file, 0o600);
  }
  return { values, app };
}

function composeArgs(...args) {
  return [
    'compose',
    '--project-name', composeProject,
    '--env-file', envFile,
    '-f',
    composeFile,
    ...args,
  ];
}

function mongoEval(script) {
  return run('docker', ['exec', containerName, 'mongosh', '--quiet', '--eval', script]);
}

async function waitForPrimary(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  const script = `
    const admin = db.getSiblingDB('admin');
    const auth = admin.auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD);
    if (auth !== 1 && auth?.ok !== 1) quit(21);
    try {
      const status = rs.status();
      if (status.set !== 'rs0') quit(22);
      if (status.myState === 1) quit(0);
    } catch (error) {
      if (error.code === 94 || error.codeName === 'NotYetInitialized') {
        rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]});
      } else {
        throw error;
      }
    }
    quit(23);
  `;

  while (Date.now() < deadline) {
    const result = spawnSync('docker', ['exec', containerName, 'mongosh', '--quiet', '--eval', script], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status === 0) return;
    if (result.error) throw result.error;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Mongo replica set did not become primary; inspect container logs with docker logs ${containerName}`);
}

async function verifyAppConnection(appEnv) {
  run(process.execPath, ['./scripts/dev-db-check.mjs'], {
    cwd: path.join(root, 'server'),
    env: { ...process.env, MONGODB_URI: appEnv.MONGODB_URI },
  });
}

async function up() {
  const { app } = await loadPrivateEnv();
  run('docker', composeArgs('up', '-d'));
  await waitForPrimary();
  await verifyAppConnection(app);
  console.log('Local Mongo is ready on 127.0.0.1:27028; credentials remain in ignored .local/mongo/app.env');
}

async function restoreBaseline() {
  const { app } = await loadPrivateEnv();
  const archive = path.join(root, '.local/execution/p0/restart/mongodb.archive');
  if (!(await exists(archive))) throw new Error('P0 Mongo archive is unavailable; no restore was attempted');
  await waitForPrimary();

  const probe = spawnSync('docker', [
    'exec', containerName,
    'mongosh', '--quiet', '--eval',
    `const app=db.getSiblingDB('${databaseName}');const a=db.getSiblingDB('admin');const auth=a.auth(process.env.MONGO_INITDB_ROOT_USERNAME,process.env.MONGO_INITDB_ROOT_PASSWORD);if(auth!==1&&auth?.ok!==1)quit(31);if(app.tracks.countDocuments()||app.comments.countDocuments())quit(32);`,
  ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (probe.status !== 0) {
    throw new Error('Restore target is not empty or Mongo is unavailable; no baseline records were imported');
  }

  const configPath = '/tmp/gurach-restore.yml';
  run('docker', ['cp', restoreConfig, `${containerName}:${configPath}`]);
  run('docker', ['exec', containerName, 'chmod', '0600', configPath]);
  const restore = spawnSync('docker', [
    'exec', '-i', containerName, 'mongorestore',
    `--config=${configPath}`,
    '--archive', '--nsInclude=nest.*', '--nsFrom=nest.*', '--nsTo=gurach.*',
  ], {
    cwd: root,
    input: await readFile(archive),
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (restore.error) throw restore.error;
  if (restore.status !== 0) throw new Error(`mongorestore exited with status ${restore.status}`);
  await verifyAppConnection(app);
  mongoEval(`const a=db.getSiblingDB('admin');const auth=a.auth(process.env.MONGO_INITDB_ROOT_USERNAME,process.env.MONGO_INITDB_ROOT_PASSWORD);if(auth!==1&&auth?.ok!==1)quit(41);const d=db.getSiblingDB('${databaseName}');printjson({tracks:d.tracks.countDocuments(),comments:d.comments.countDocuments()});`);
  console.log('P0 archive restored into the new gurach database; the original Mongo volume was not changed');
}

async function backupDevDatabase() {
  await loadPrivateEnv();
  await waitForPrimary();
  const directory = path.join(root, '.local', 'backups');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const archive = path.join(directory, `gurach-${stamp}.archive`);
  if (await exists(archive)) throw new Error('Backup destination already exists; refusing to overwrite it');

  const configPath = '/tmp/gurach-backup.yml';
  const archivePath = '/tmp/gurach-backup.archive';
  run('docker', ['cp', restoreConfig, `${containerName}:${configPath}`]);
  try {
    run('docker', ['exec', containerName, 'chmod', '0600', configPath]);
    run('docker', [
      'exec', containerName, 'mongodump', `--config=${configPath}`,
      `--archive=${archivePath}`, `--db=${databaseName}`,
    ]);
    run('docker', ['cp', `${containerName}:${archivePath}`, archive]);
    await chmod(archive, 0o600);
    console.log(`Private database backup written to ${path.relative(root, archive)}`);
  } finally {
    run('docker', ['exec', containerName, 'rm', '-f', configPath, archivePath]);
  }
}

const action = process.argv[2] ?? 'up';
if (action === 'up') await up();
else if (action === 'down') run('docker', composeArgs('down'));
else if (action === 'status') run('docker', composeArgs('ps'));
else if (action === 'restore-baseline') await restoreBaseline();
else if (action === 'backup') await backupDevDatabase();
else throw new Error('Usage: node scripts/dev-db.mjs [up|down|status|restore-baseline|backup]');
