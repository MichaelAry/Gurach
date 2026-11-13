import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const port = Number(process.env.FIXTURE_API_PORT ?? 5300);
const total = 121;
const tracks = Array.from({ length: total }, (_, index) => {
  const number = index + 1;
  return {
    _id: number.toString(16).padStart(24, '0'),
    name: `Track ${number}`,
    artist: `Artist ${number}`,
    audio: `http://127.0.0.1:${port}/static/audio/track-${number}.mp3`,
    picture: null,
    duration: 180,
    listens: 0,
  };
});
const commentsByTrack = new Map([
  [tracks[0]._id, Array.from({ length: 45 }, (_, index) => ({
    _id: (index + 1).toString(16).padStart(24, '0'),
    trackId: tracks[0]._id,
    authorId: null,
    username: `Listener ${index + 1}`,
    text: index === 0 ? 'Comment with unknown date' : `Comment ${index + 1}`,
    rating: index % 2 === 0 ? 8 : null,
    createdAt: index === 0 ? null : new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }))],
  [tracks[2]._id, []],
]);
let failFirstNextCommentPage = true;
const sessions = new Map();
const accountFavorites = new Map();
const accountQueues = new Map();
const accountHistory = new Map();
const accountPlaybacks = new Map();

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges');
  const fixtureUser = { id: '000000000000000000000001', username: 'fixture_user', displayName: 'Пользователь теста', role: 'user' };
  const secondUser = { ...fixtureUser, id: '000000000000000000000002', username: 'fixture_other', displayName: 'Другой пользователь' };
  const token = request.headers.authorization?.replace(/^Bearer /, '');
  // Fixed sessions support direct-cookie upload tests; browser logins get isolated state.
  const sessionUser = token === 'a'.repeat(43) ? fixtureUser : token === 'b'.repeat(43) ? secondUser : sessions.get(token) ?? null;
  const accountKey = sessionUser ? `${sessionUser.id}:${token}` : null;
  if (request.method === 'GET' && ['/home/releases', '/home/popular', '/home/activity', '/friends', '/friends/summary', '/friends/requests', '/friends/blocks'].includes(url.pathname)) {
    const personal = !['/home/releases', '/home/popular'].includes(url.pathname);
    if (personal && !sessionUser) { response.writeHead(401); response.end(); return; }
    response.setHeader('content-type', 'application/json');
    response.setHeader('Cache-Control', personal ? 'private, no-store' : 'no-store');
    if (url.pathname === '/home/releases') {
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      const count = Number(url.searchParams.get('count') ?? 20);
      response.end(JSON.stringify({ items: tracks.slice(offset, offset + count), nextCursor: offset + count < tracks.length ? String(offset + count) : null })); return;
    }
    if (url.pathname === '/home/popular') {
      response.end(JSON.stringify({ items: tracks.slice(0, 5) })); return;
    }
    if (url.pathname === '/friends/summary') {
      response.end(JSON.stringify({ friendsCount: 0, incomingRequestsCount: 0, outgoingRequestsCount: 0, blockedUsersCount: 0 })); return;
    }
    // Both accounts start without friendships, requests, blocks or friend activity.
    response.end(JSON.stringify({ items: [], nextCursor: null })); return;
  }
  if (url.pathname.startsWith('/account/')) {
    if (!sessionUser) { response.writeHead(401); response.end(); return; }
    response.setHeader('content-type', 'application/json');
    response.setHeader('Cache-Control', 'private, no-store');
    const uploads = sessionUser.id === fixtureUser.id ? tracks.slice(0, 21) : [];
    if (!accountHistory.has(accountKey)) accountHistory.set(accountKey, sessionUser.id === fixtureUser.id ? [
      { id: 'history-1', trackId: tracks[0]._id, listenedAt: '2026-01-02T12:00:00.000Z', track: tracks[0] },
      { id: 'history-2', trackId: 'f'.repeat(24), listenedAt: '2026-01-01T12:00:00.000Z', track: null },
    ] : []);
    const history = accountHistory.get(accountKey);
    if (!accountFavorites.has(accountKey)) accountFavorites.set(accountKey, []);
    const favorites = accountFavorites.get(accountKey);
    if (url.pathname === '/account/favorite-ids' && request.method === 'GET') {
      response.end(JSON.stringify(favorites)); return;
    }
    if (url.pathname.startsWith('/account/favorites/') && ['PUT', 'DELETE'].includes(request.method)) {
      const id = url.pathname.split('/').at(-1), index = favorites.indexOf(id);
      if (request.method === 'PUT' && index < 0) favorites.unshift(id);
      if (request.method === 'DELETE' && index >= 0) favorites.splice(index, 1);
      response.end('{}'); return;
    }
    if (url.pathname === '/account/statistics' && request.method === 'GET') {
      response.end(JSON.stringify({ uploadedTracks: uploads.length, totalListens: history.length, uniqueTracks: new Set(history.map((item) => item.trackId)).size,
        receivedListens: uploads.reduce((sum, track) => sum + track.listens, 0), comments: sessionUser.id === fixtureUser.id ? 3 : 0 })); return;
    }
    if (['/account/uploads', '/account/history', '/account/favorites'].includes(url.pathname) && request.method === 'GET') {
      const rows = url.pathname.endsWith('favorites') ? favorites.map((id) => tracks.find((track) => track._id === id)).filter(Boolean) : url.pathname.endsWith('uploads') ? uploads : history;
      const offset = Number(url.searchParams.get('cursor') ?? 0), count = Number(url.searchParams.get('count') ?? 20);
      response.end(JSON.stringify({ items: rows.slice(offset, offset + count), nextCursor: offset + count < rows.length ? String(offset + count) : null })); return;
    }
    if (url.pathname === '/account/listens' && request.method === 'POST') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const event = JSON.parse(body), key = `${accountKey}:${event.playbackId}`;
        if (!accountPlaybacks.has(key)) {
          const track = tracks.find((item) => item._id === event.trackId);
          if (!track) { response.writeHead(404); response.end(); return; }
          track.listens++;
          history.unshift({ id: key, trackId: track._id, listenedAt: new Date().toISOString(), track });
          accountPlaybacks.set(key, track.listens);
        }
        response.end(JSON.stringify({ listens: accountPlaybacks.get(key) }));
      }); return;
    }
    response.writeHead(404); response.end(); return;
  }
  if (url.pathname === '/tracks/random' && request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify(tracks.slice(0, 50))); return;
  }
  if (url.pathname === '/tracks/resolve' && request.method === 'POST') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const ids = JSON.parse(body).ids;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ items: ids.map((trackId) => {
        const track = tracks.find((item) => item._id === trackId) ?? null;
        return { trackId, track, availability: track ? 'playable' : 'unavailable', reason: track ? null : 'deleted' };
      }) }));
    });
    return;
  }
  if (url.pathname === '/queue' && request.method === 'GET') {
    if (!sessionUser) { response.writeHead(401); response.end(); return; }
    const entries = [tracks[0], tracks[0], tracks[1]].map((track, index) => ({
      entryId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, trackId: track._id,
      display: { name: track.name, artist: track.artist }, track, availability: 'playable', reason: null,
    }));
    response.writeHead(200, { 'content-type': 'application/json' });
    if (!accountQueues.has(accountKey)) accountQueues.set(accountKey, { revision: 1, capacity: 100, entries, updatedAt: null });
    response.end(JSON.stringify(accountQueues.get(accountKey))); return;
  }
  if (url.pathname === '/queue' && request.method === 'PUT') {
    if (!sessionUser) { response.writeHead(401); response.end(); return; }
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const input = JSON.parse(body), old = accountQueues.get(accountKey);
      if (!old || input.expectedRevision !== old.revision) { response.writeHead(409); response.end(); return; }
      const entries = input.entries.map((entry) => {
        const track = tracks.find((item) => item._id === entry.trackId);
        return { ...entry, display: { name: track.name, artist: track.artist }, track, availability: 'playable', reason: null };
      });
      const saved = { revision: old.revision + 1, capacity: 100, entries, updatedAt: new Date().toISOString() };
      accountQueues.set(accountKey, saved);
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(saved));
    }); return;
  }
  if (url.pathname === '/auth/login' && request.method === 'POST') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const value = JSON.parse(body);
      if (!['fixture_user', 'fixture_other'].includes(value.username) || value.password !== 'fixture password long') {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials', requestId: 'fixture' } }));
        return;
      }
      const token = randomBytes(32).toString('base64url');
      const user = value.username === 'fixture_user' ? fixtureUser : secondUser;
      sessions.set(token, user);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ token, user, expiresAt: new Date(Date.now() + 600000).toISOString() }));
    });
    return;
  }
  if (url.pathname === '/auth/me') {
    response.writeHead(sessionUser ? 200 : 401, { 'content-type': 'application/json' });
    response.end(JSON.stringify(sessionUser ? { user: sessionUser, expiresAt: new Date(Date.now() + 600000).toISOString() } : { error: { code: 'UNAUTHORIZED', message: 'Invalid session', requestId: 'fixture' } }));
    return;
  }
  if (url.pathname === '/auth/logout') { response.writeHead(204); response.end(); return; }
  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"status":"ok"}');
    return;
  }
  if (url.pathname === '/tracks' && request.method === 'POST') {
    if (!sessionUser) { response.writeHead(401); response.end(); return; }
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', async () => {
      try {
        const form = await new Response(Buffer.concat(chunks), {
          headers: { 'content-type': request.headers['content-type'] },
        }).formData();
        if (!form.get('name') || !form.get('audio') || !form.get('picture')) {
          response.writeHead(400); response.end(); return;
        }
        const track = {
          _id: (total + tracks.length + 1).toString(16).padStart(24, '0'),
          name: String(form.get('name')), artist: String(form.get('artist') ?? ''),
          lyrics: String(form.get('text') ?? ''), ownerId: sessionUser.id,
          audio: tracks[0].audio, picture: null, duration: 20, listens: 0,
        };
        tracks.push(track);
        response.writeHead(201, { 'content-type': 'application/json' });
        response.end(JSON.stringify(track));
      } catch {
        response.writeHead(400); response.end();
      }
    });
    return;
  }
  if (url.pathname === '/tracks' && request.method === 'GET') {
    const count = Number(url.searchParams.get('count') ?? 20);
    const offset = Number(url.searchParams.get('cursor') ?? 0);
    if (!Number.isSafeInteger(count) || count < 1 || count > 100 || !Number.isSafeInteger(offset) || offset < 0) {
      response.writeHead(400);
      response.end();
      return;
    }
    const end = Math.min(offset + count, tracks.length);
    const body = JSON.stringify({
      items: tracks.slice(offset, end),
      nextCursor: end < tracks.length ? String(end) : null,
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(body);
    return;
  }
  const trackMatch = /^\/tracks\/([a-f\d]{24})$/i.exec(url.pathname);
  if (trackMatch && request.method === 'GET') {
    const track = tracks.find((item) => item._id.toLowerCase() === trackMatch[1].toLowerCase());
    if (!track) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Track not found', requestId: 'fixture' } }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ...track, lyrics: track.lyrics ?? null, ownerId: track.ownerId ?? null }));
    return;
  }
  const commentsMatch = /^\/tracks\/([a-f\d]{24})\/comments$/i.exec(url.pathname);
  if (commentsMatch && request.method === 'GET') {
    if (commentsMatch[1] === tracks[1]._id) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Fixture unavailable', requestId: 'fixture' } }));
      return;
    }
    const all = commentsByTrack.get(commentsMatch[1]) ?? [];
    const count = Number(url.searchParams.get('count') ?? 20);
    const offset = Number(url.searchParams.get('cursor') ?? 0);
    if (commentsMatch[1] === tracks[0]._id && offset === 20 && failFirstNextCommentPage) {
      failFirstNextCommentPage = false;
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Temporary fixture failure', requestId: 'fixture' } }));
      return;
    }
    if (!Number.isSafeInteger(count) || count < 1 || count > 100 || !Number.isSafeInteger(offset) || offset < 0) {
      response.writeHead(400);
      response.end();
      return;
    }
    const end = Math.min(offset + count, all.length);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ items: all.slice(offset, end), nextCursor: end < all.length ? String(end) : null }));
    return;
  }
  if (/^\/tracks\/[a-f\d]{24}\/listen$/i.test(url.pathname) && request.method === 'POST') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ listens: 1 }));
    return;
  }
  if (/^\/static\/audio\/track-\d+\.mp3$/.test(url.pathname)) {
    const samples = 8000 * (url.pathname.endsWith('/track-121.mp3') ? 180 : 20);
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    response.setHeader('Accept-Ranges', 'bytes');
    if (start >= wav.length || end < start) {
      response.writeHead(416, { 'Content-Range': `bytes */${wav.length}` }); response.end(); return;
    }
    if (range) response.setHeader('Content-Range', `bytes ${start}-${end}/${wav.length}`);
    response.writeHead(range ? 206 : 200, { 'content-type': 'audio/wav', 'content-length': end - start + 1 });
    response.end(wav.subarray(start, end + 1));
    return;
  }
  response.writeHead(404);
  response.end();
});

server.listen(port, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
