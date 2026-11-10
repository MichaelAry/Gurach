import { createServer } from 'node:https';
import { request as proxyRequest } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const temp = await mkdtemp(path.join(os.tmpdir(), 'gurach-https-'));
const key = path.join(temp, 'key.pem');
const cert = path.join(temp, 'cert.pem');
const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
if (generated.status !== 0) throw new Error('Test certificate generation failed');
const env = { ...process.env, API_URL: 'http://127.0.0.1:5300', APP_ORIGIN: 'https://127.0.0.1:3443', NEXT_DIST_DIR: '.next-e2e-https' };
const build = spawn('npm', ['run', 'build'], { env, stdio: 'inherit' });
await new Promise((resolve, reject) => build.on('exit', (code) => code === 0 ? resolve() : reject(new Error('Production fixture build failed'))));
const next = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', '3201'], { env, stdio: 'inherit' });
const server = createServer({ key: await readFile(key), cert: await readFile(cert) }, (incoming, outgoing) => {
  const upstream = proxyRequest({ hostname: '127.0.0.1', port: 3201, path: incoming.url, method: incoming.method, headers: incoming.headers }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on('error', () => { outgoing.writeHead(502); outgoing.end(); });
  incoming.pipe(upstream);
});
server.listen(3443, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  next.kill('SIGTERM'); server.close(); await rm(temp, { recursive: true, force: true }); process.exit(0);
});
