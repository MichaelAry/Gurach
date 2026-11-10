import { afterEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const { jar, proxyBackend } = vi.hoisted(() => ({
  jar: { get: vi.fn(), set: vi.fn() },
  proxyBackend: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('./backend', () => ({ proxyBackend }))
import { checkBrowserMutation } from './csrf'
import { sessionCookieName, sessionCookieOptions, proxySessionBackend } from './session'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as logout } from '@/app/api/auth/logout/route'

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
it('reports a failed session revocation and keeps the cookie for a retry', async () => {
  vi.stubEnv('APP_ORIGIN', 'https://app.example')
  proxyBackend.mockResolvedValueOnce(Response.json({ error: { code: 'BACKEND_UNAVAILABLE' } }, { status: 502 }))
  const response = await logout(new Request('https://app.example/api/auth/logout', { method: 'POST', headers: { origin: 'https://app.example', 'x-gurach-request': '1' } }))
  expect(response.status).toBe(502)
  expect(jar.set).not.toHaveBeenCalled()
})
it('requires exact configured Origin and request header', () => {
  vi.stubEnv('APP_ORIGIN', 'https://app.example')
  for (const headers of ([{}, { origin: 'https://evil.example', 'x-gurach-request': '1' }, { origin: 'https://app.example' }] as Record<string, string>[])) {
    expect(checkBrowserMutation(new Request('https://app.example/api', { headers }))?.status).toBe(403)
  }
  expect(checkBrowserMutation(new Request('https://app.example/api', { headers: { origin: 'https://app.example', 'x-gurach-request': '1' } }))).toBeNull()
})
it('uses host-only production cookie policy and forwards only the cookie token', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  expect(sessionCookieName()).toBe('__Host-gurach_session')
  expect(sessionCookieOptions()).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
  jar.get.mockReturnValue({ value: 'a'.repeat(43) })
  proxyBackend.mockResolvedValue(new Response(null, { status: 204 }))
  await proxySessionBackend('/auth/me')
  expect(proxyBackend).toHaveBeenCalledWith('/auth/me', undefined, 'a'.repeat(43))
})
it('sets cookie after successful login, omits token from JSON and clears expired logout', async () => {
  vi.stubEnv('APP_ORIGIN', 'https://app.example')
  const headers = { origin: 'https://app.example', 'x-gurach-request': '1', 'content-type': 'application/json' }
  const token = 'b'.repeat(43)
  proxyBackend.mockResolvedValueOnce(Response.json({ token, user: { id: '1', username: 'user', displayName: 'User', role: 'user', token }, expiresAt: new Date(Date.now() + 60000).toISOString() }))
  const response = await login(new Request('https://app.example/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ username: 'user', password: 'long secret password' }) }))
  expect(response.status).toBe(200)
  expect(await response.text()).not.toContain(token)
  expect(jar.set).toHaveBeenCalled()
  proxyBackend.mockResolvedValueOnce(new Response(null, { status: 401 }))
  expect((await logout(new Request('https://app.example/api/auth/logout', { method: 'POST', headers }))).status).toBe(204)
  expect(jar.set).toHaveBeenLastCalledWith(expect.any(String), '', expect.objectContaining({ maxAge: 0 }))
})
