import { createHash, timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'

const SECRET_HEADER = 'x-gurach-cache-secret'
const MAX_BODY_BYTES = 4 * 1024
const OBJECT_ID = /^[a-f\d]{24}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CacheEventType = 'track.activated' | 'track.deleted'

interface CacheEventMessage {
  eventId: string
  type: CacheEventType
  trackId: string
}

function response(status: number, body?: Record<string, boolean>) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    },
  })
}

function matchesSecret(expected: string, supplied: string | null): boolean {
  if (!supplied || Buffer.byteLength(supplied, 'utf8') > 512) return false
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest()
  const suppliedDigest = createHash('sha256').update(supplied, 'utf8').digest()
  return timingSafeEqual(expectedDigest, suppliedDigest)
}

type BoundedJsonResult =
  | { kind: 'ok'; value: unknown }
  | { kind: 'too-large' }
  | { kind: 'invalid' }

async function readBoundedJson(request: Request): Promise<BoundedJsonResult> {
  const reader = request.body?.getReader()
  if (!reader) return { kind: 'invalid' }
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      return { kind: 'too-large' }
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { kind: 'ok', value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown }
  } catch {
    return { kind: 'invalid' }
  }
}

function parseEvent(value: unknown): CacheEventMessage | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.join(',') !== 'eventId,trackId,type') return null
  if (
    typeof record.eventId !== 'string' ||
    typeof record.trackId !== 'string' ||
    !OBJECT_ID.test(record.trackId) ||
    (record.type !== 'track.activated' && record.type !== 'track.deleted')
  ) return null

  const eventIdValid = record.type === 'track.activated'
    ? typeof record.eventId === 'string' && record.eventId.length === 46 && `${record.eventId}`.endsWith(':activated') && UUID_V4.test(record.eventId.slice(0, -10))
    : record.eventId === `track.deleted:${record.trackId.toLowerCase()}`
  if (!eventIdValid) return null
  return {
    eventId: record.eventId,
    type: record.type,
    trackId: record.trackId.toLowerCase(),
  }
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CACHE_EVENT_SECRET?.trim()
  if (!secret || !/^[A-Za-z0-9._~-]{32,256}$/.test(secret)) return response(503, { error: true })
  if (!matchesSecret(secret, request.headers.get(SECRET_HEADER))) return response(401, { error: true })

  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return response(415, { error: true })
  const contentLength = request.headers.get('content-length')
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) {
    return response(413, { error: true })
  }

  const parsed = await readBoundedJson(request)
  if (parsed.kind === 'too-large') return response(413, { error: true })
  if (parsed.kind === 'invalid') return response(400, { error: true })
  const event = parseEvent(parsed.value)
  if (!event) return response(400, { error: true })

  const tags = ['tracks', `track:${event.trackId}`]
  if (event.type === 'track.deleted') tags.push(`track-comments:${event.trackId}`)
  // The installed Next revalidateTag API supports CacheLifeConfig; expire: 0 makes stale entries unusable immediately.
  for (const tag of tags) revalidateTag(tag, { expire: 0 })
  return response(202, { accepted: true })
}
