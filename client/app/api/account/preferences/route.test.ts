import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const { proxySessionBackend } = vi.hoisted(() => ({ proxySessionBackend: vi.fn() }))
vi.mock('@/lib/server/session', () => ({ proxySessionBackend }))
import { GET, PUT } from './route'
const origin = 'http://localhost:3000'
const request = (body: unknown, trusted = true) => new Request(`${origin}/api/account/preferences`, {
  method: 'PUT', headers: { 'content-type': 'application/json', ...(trusted ? { origin, 'X-Gurach-Request': '1' } : {}) }, body: JSON.stringify(body),
})
beforeEach(() => { vi.stubEnv('APP_ORIGIN', origin); proxySessionBackend.mockReset() })
afterEach(() => vi.unstubAllEnvs())
it('rejects foreign mutations and unsupported preferences before reaching the backend', async () => {
  expect((await PUT(request({ preferredLocale: 'ru' }, false))).status).toBe(403)
  for (const body of [{ preferredLocale: 'de' }, {}, { preferredLocale: 'ru', initialize: null }, { preferredLocale: 'en', userId: 'other' }]) {
    expect((await PUT(request(body))).status).toBe(400)
  }
  expect(proxySessionBackend).not.toHaveBeenCalled()
})
it('forwards a validated update using the current session and prevents caching', async () => {
  proxySessionBackend.mockResolvedValue(Response.json({ preferredLocale: 'ru' }))
  const response = await PUT(request({ preferredLocale: 'ru', initialize: true }))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(proxySessionBackend).toHaveBeenCalledWith('/account/preferences', expect.objectContaining({ method: 'PUT', body: '{"preferredLocale":"ru","initialize":true}' }))
})
it('reads only current-account preferences without shared caching', async () => {
  proxySessionBackend.mockResolvedValue(Response.json({ preferredLocale: null }))
  const response = await GET(new Request(`${origin}/api/account/preferences`))
  expect(await response.json()).toEqual({ preferredLocale: null })
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
