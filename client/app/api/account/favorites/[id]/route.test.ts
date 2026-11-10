import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const { proxySessionBackend } = vi.hoisted(() => ({ proxySessionBackend: vi.fn() }))
vi.mock('@/lib/server/session', () => ({ proxySessionBackend }))
import { PUT, DELETE } from './route'

const id = 'a'.repeat(24)
const context = (value = id) => ({ params: Promise.resolve({ id: value }) })
const headers = { origin: 'http://localhost:3000', 'x-gurach-request': '1' }
beforeEach(() => { vi.stubEnv('APP_ORIGIN', 'http://localhost:3000'); vi.clearAllMocks() })

it('rejects untrusted writes and malformed track identities before contacting the backend', async () => {
  expect((await PUT(new Request('http://localhost:3000/api/account/favorites/' + id, { method: 'PUT' }), context())).status).toBe(403)
  expect((await DELETE(new Request('http://localhost:3000/api/account/favorites/bad', { method: 'DELETE', headers }), context('bad'))).status).toBe(400)
  expect(proxySessionBackend).not.toHaveBeenCalled()
})

it.each(['PUT', 'DELETE'])('forwards %s through the authenticated boundary with private caching', async (method) => {
  proxySessionBackend.mockResolvedValue(new Response(null, { status: 204 }))
  const handler = method === 'PUT' ? PUT : DELETE
  const response = await handler(new Request('http://localhost:3000/api/account/favorites/' + id, { method, headers }), context())
  expect(response.status).toBe(204)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(proxySessionBackend).toHaveBeenCalledWith('/account/favorites/' + id, expect.objectContaining({ method }))
})
