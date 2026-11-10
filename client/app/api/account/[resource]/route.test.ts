import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const { proxySessionBackend } = vi.hoisted(() => ({ proxySessionBackend: vi.fn() }))
vi.mock('@/lib/server/session', () => ({ proxySessionBackend }))
import { GET, POST } from './route'

const context = (resource: string) => ({ params: Promise.resolve({ resource }) })
const headers = { origin: 'http://localhost:3000', 'x-gurach-request': '1', 'content-type': 'application/json' }
beforeEach(() => { vi.stubEnv('APP_ORIGIN', 'http://localhost:3000'); vi.clearAllMocks() })

it('forwards private account queries through the session boundary', async () => {
  proxySessionBackend.mockResolvedValue(Response.json({ items: [], nextCursor: null }))
  const response = await GET(new Request('http://localhost:3000/api/account/history?cursor=test&count=1'), context('history'))
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(proxySessionBackend.mock.calls[0][0]).toBe('/account/history?cursor=test&count=1')
  expect((await GET(new Request('http://localhost:3000/api/account/unknown'), context('unknown'))).status).toBe(404)
  expect(proxySessionBackend).toHaveBeenCalledTimes(1)
})

it('validates CSRF and bounds the body before forwarding only the event fields', async () => {
  expect((await POST(new Request('http://localhost:3000/api/account/listens', { method: 'POST', body: '{}' }), context('listens'))).status).toBe(403)
  for (const [body, status] of [['x'.repeat(65537), 413], ['{}', 400], ['null', 400]]) {
    expect((await POST(new Request('http://localhost:3000/api/account/listens', { method: 'POST', headers, body: String(body) }), context('listens'))).status).toBe(status)
  }
  expect(proxySessionBackend).not.toHaveBeenCalled()
  proxySessionBackend.mockResolvedValue(Response.json({ listens: 1 }))
  const event = { trackId: 'a'.repeat(24), playbackId: '00000000-0000-4000-8000-000000000001' }
  const response = await POST(new Request('http://localhost:3000/api/account/listens', { method: 'POST', headers, body: JSON.stringify({ ...event, userId: 'forged' }) }), context('listens'))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(JSON.parse(proxySessionBackend.mock.calls[0][1].body)).toEqual(event)
})
