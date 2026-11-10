import { beforeEach, describe, expect, it, vi } from 'vitest'

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag }))

import { POST } from './route'

const secret = 'test_cache_event_secret_is_at_least_32_chars_long'
const trackId = '507f1f77bcf86cd799439011'

function eventRequest(body: unknown, token = secret, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/internal/cache-events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gurach-cache-secret': token,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('internal cache event route', () => {
  beforeEach(() => {
    vi.stubEnv('CACHE_EVENT_SECRET', secret)
    revalidateTag.mockClear()
  })

  it('derives activation tags from the fixed event payload and immediately expires them', async () => {
    const response = await POST(eventRequest({
      eventId: 'c663e4bb-4331-4d52-a191-130342a149d5:activated',
      type: 'track.activated',
      trackId,
    }))

    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(revalidateTag.mock.calls).toEqual([
      ['tracks', { expire: 0 }],
      [`track:${trackId}`, { expire: 0 }],
    ])
  })

  it('also expires comments for deleted tracks', async () => {
    const response = await POST(eventRequest({
      eventId: `track.deleted:${trackId}`,
      type: 'track.deleted',
      trackId,
    }))

    expect(response.status).toBe(202)
    expect(revalidateTag.mock.calls).toEqual([
      ['tracks', { expire: 0 }],
      [`track:${trackId}`, { expire: 0 }],
      [`track-comments:${trackId}`, { expire: 0 }],
    ])
  })

  it('rejects event IDs that do not correspond to the event kind', async () => {
    const response = await POST(eventRequest({
      eventId: 'client-chosen-tag',
      type: 'track.deleted',
      trackId,
    }))
    expect(response.status).toBe(400)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('rejects bad secrets, malformed shapes, oversized bodies and missing production configuration', async () => {
    expect((await POST(eventRequest({}, 'wrong-secret'))).status).toBe(401)
    expect((await POST(eventRequest({ type: 'track.deleted', trackId, eventId: `track.deleted:${trackId}`, tag: 'arbitrary' }))).status).toBe(400)
    expect((await POST(eventRequest({}, secret, { 'content-length': '5000' }))).status).toBe(413)
    expect((await POST(eventRequest('x'.repeat(5000), secret, { 'content-length': '' }))).status).toBe(413)
    vi.stubEnv('CACHE_EVENT_SECRET', '')
    expect((await POST(eventRequest({}))).status).toBe(503)
  })
})
