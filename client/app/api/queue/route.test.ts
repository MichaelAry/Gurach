import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const { proxySessionBackend, proxyBackend } = vi.hoisted(() => ({ proxySessionBackend: vi.fn(), proxyBackend: vi.fn() }))
vi.mock('@/lib/server/session', () => ({ proxySessionBackend }))
vi.mock('@/lib/server/backend', () => ({ proxyBackend }))
import { GET, PUT } from './route'
import { POST as resolve } from '../tracks/resolve/route'
const headers = { origin: 'http://localhost:3000', 'x-gurach-request': '1', 'content-type': 'application/json' }
beforeEach(() => { vi.stubEnv('APP_ORIGIN', 'http://localhost:3000'); vi.clearAllMocks() })
it('retains conflict status and drops forged queue owner fields', async () => {
  proxySessionBackend.mockResolvedValue(Response.json({ error: { code: 'QUEUE_CONFLICT' } }, { status: 409 }))
  const response = await PUT(new Request('http://localhost:3000/api/queue', { method: 'PUT', headers, body: JSON.stringify({ expectedRevision: 1, mutationId: 'id', entries: [], userId: 'forged' }) }))
  expect(response.status).toBe(409)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(JSON.parse(proxySessionBackend.mock.calls[0][1].body)).toEqual({ expectedRevision: 1, mutationId: 'id', entries: [] })
})
it('checks CSRF and size before forwarding a write', async () => {
  expect((await PUT(new Request('http://localhost/api/queue', { method: 'PUT', body: '{}' }))).status).toBe(403)
  expect((await PUT(new Request('http://localhost/api/queue', { method: 'PUT', headers, body: 'x'.repeat(65537) }))).status).toBe(413)
  expect(proxySessionBackend).not.toHaveBeenCalled()
})
it('serves private queue reads and validates guest resolver boundaries without session forwarding', async () => {
  proxySessionBackend.mockResolvedValue(Response.json({ entries: [] }))
  expect((await GET(new Request('http://localhost/api/queue'))).headers.get('cache-control')).toBe('private, no-store')
  for (const ids of [[], ['bad'], Array.from({ length: 101 }, () => '0'.repeat(24))]) {
    expect((await resolve(new Request('http://localhost/api/tracks/resolve', { method: 'POST', headers, body: JSON.stringify({ ids }) }))).status).toBe(400)
  }
  proxyBackend.mockResolvedValue(Response.json({ items: [] }))
  await resolve(new Request('http://localhost/api/tracks/resolve', { method: 'POST', headers, body: JSON.stringify({ ids: ['0'.repeat(24)], userId: 'forged' }) }))
  expect(proxyBackend).toHaveBeenCalledTimes(1)
  expect(JSON.parse(proxyBackend.mock.calls[0][1].body)).toEqual({ ids: ['0'.repeat(24)] })
})
