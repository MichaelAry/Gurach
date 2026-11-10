/* Persistent, bounded byte windows. Media URLs contain immutable upload UUIDs.
 * Keep container headers/trailers as well as the resume window so the browser's
 * native demuxer can seek without replacing the audio source or its timeline.
 */
const CACHE = 'gurach-audio-v1'
const BLOCK = 256 * 1024
const MAX_BLOCKS = 64 // 16 MiB, shared by all tracks/tabs.
const jobs = new Map()

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

function key(url, block) {
  const result = new URL('/__audio_cache__', self.location.origin)
  result.searchParams.set('url', url)
  result.searchParams.set('block', String(block))
  return result.href
}
function mediaUrl(value) {
  try {
    const url = new URL(value, self.location.origin)
    return ['http:', 'https:'].includes(url.protocol) && /\/static\/audio\/[^/]+$/.test(url.pathname) ? url.href : null
  } catch { return null }
}
async function getBlock(cache, url, index, signal) {
  const cacheKey = key(url, index)
  const existing = await cache.match(cacheKey)
  if (existing) return existing
  const start = index * BLOCK
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${start + BLOCK - 1}` }, signal, credentials: 'omit' })
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') || '')
  // Never download a whole file when a server ignores Range or CORS hides it.
  if (response.status !== 206 || !range || Number(range[1]) !== start || Number(range[2]) >= start + BLOCK) {
    await response.body?.cancel()
    return null
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength !== Number(range[2]) - start + 1) return null
  const stored = new Response(bytes, { headers: {
    'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
    'X-Audio-Total': range[3],
    'X-Audio-Start': range[1],
  } })
  // Cache Storage cannot store 206 responses; internal blocks use status 200.
  await cache.put(cacheKey, stored.clone())
  const keys = await cache.keys()
  for (const entry of keys.slice(0, Math.max(0, keys.length - MAX_BLOCKS))) await cache.delete(entry)
  return stored
}
async function warm(message, signal) {
  const cache = await caches.open(CACHE)
  const first = await getBlock(cache, message.url, 0, signal)
  if (!first) return
  const total = Number(first.headers.get('X-Audio-Total'))
  if (!Number.isSafeInteger(total) || total <= 0) return
  const last = Math.floor((total - 1) / BLOCK)
  // Byte/time mapping is approximate for VBR media. Include a safety margin and
  // entire blocks; this deliberately retains more than five seconds of audio.
  const from = Math.max(0, Math.floor(total * Math.max(0, message.position - 2) / message.duration / BLOCK) - 1)
  const to = Math.min(last, Math.floor(total * Math.min(message.duration, message.position + 7) / message.duration / BLOCK) + 1)
  const blocks = [...new Set([0, last, ...Array.from({ length: Math.min(to - from + 1, MAX_BLOCKS - 2) }, (_, offset) => from + offset)])]
  for (const index of blocks) {
    if (signal.aborted) return
    await getBlock(cache, message.url, index, signal)
  }
  // Retain the current window, not an ever-growing copy of the track.
  for (const entry of await cache.keys()) {
    const stored = new URL(entry.url)
    if (stored.searchParams.get('url') === message.url && !blocks.includes(Number(stored.searchParams.get('block')))) await cache.delete(entry)
  }
}
self.addEventListener('message', (event) => {
  const message = event.data
  const url = mediaUrl(message?.url)
  if (message?.type !== 'audio-lookahead' || !url || !Number.isFinite(message.position) || message.position < 0 || !Number.isFinite(message.duration) || message.duration <= 0) return
  // Coalesce frequent timeupdate messages without launching competing downloads.
  const previous = jobs.get(url)
  if (previous) { previous.next = { ...message, url }; return }
  const job = { next: { ...message, url } }
  jobs.set(url, job)
  event.waitUntil((async () => {
    try {
      while (job.next) {
        const next = job.next
        job.next = null
        await warm(next, AbortSignal.timeout(10_000))
      }
    } catch { /* Quota, private mode, CORS and network failures must not stop playback. */ }
    finally { jobs.delete(url) }
  })())
})

async function cachedRange(request) {
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('Range') || '')
  if (!range || request.headers.has('If-Range')) return fetch(request)
  const start = Number(range[1])
  const cache = await caches.open(CACHE)
  const block = await cache.match(key(request.url, Math.floor(start / BLOCK)))
  if (!block) return fetch(request)
  const total = Number(block.headers.get('X-Audio-Total'))
  const offset = start - Number(block.headers.get('X-Audio-Start'))
  const bytes = await block.arrayBuffer()
  const end = Math.min(range[2] ? Number(range[2]) : total - 1, start + bytes.byteLength - offset - 1)
  if (!Number.isSafeInteger(start) || offset < 0 || end < start) return fetch(request)
  return new Response(bytes.slice(offset, offset + end - start + 1), { status: 206, headers: {
    'Content-Type': block.headers.get('Content-Type'),
    'Content-Length': String(end - start + 1),
    'Content-Range': `bytes ${start}-${end}/${total}`,
    'Accept-Ranges': 'bytes',
  } })
}
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !mediaUrl(event.request.url) || !event.request.headers.has('Range')) return
  event.respondWith(cachedRange(event.request).catch(() => fetch(event.request)))
})
