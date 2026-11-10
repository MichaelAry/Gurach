import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ connection: async () => undefined }))
const { jar } = vi.hoisted(() => ({ jar: { get: vi.fn() } }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
import { DELETE, GET } from './route'

const id = 'a'.repeat(24)
const token = 'b'.repeat(43)
const context = { params: Promise.resolve({ id }) }
const trusted = { origin: 'http://localhost:3000', 'x-gurach-request': '1' }

beforeEach(() => {
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3000')
  jar.get.mockReturnValue({ value: token })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'accepted' }, { status: 202 })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks() })

it('keeps track reads public without forwarding cookies or browser identity', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ _id: id }))
  const response = await GET(new Request(`http://localhost/api/tracks/${id}`, {
    headers: { authorization: 'Bearer forged', cookie: 'private=value' },
  }) as NextRequest, context)
  expect(response.status).toBe(200)
  const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers)
  expect(headers.has('authorization')).toBe(false)
  expect(headers.has('cookie')).toBe(false)
  expect(jar.get).not.toHaveBeenCalled()
})

it('authenticates deletion using only the session cookie and drops forged ownership', async () => {
  const response = await DELETE(new Request(`http://localhost/api/tracks/${id}`, {
    method: 'DELETE', headers: { ...trusted, authorization: 'Bearer forged', 'x-user-role': 'admin' },
    body: JSON.stringify({ ownerId: 'forged', role: 'admin' }),
  }) as NextRequest, context)
  expect(response.status).toBe(202)
  const init = vi.mocked(fetch).mock.calls[0][1]!
  expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${token}`)
  expect(new Headers(init.headers).has('x-user-role')).toBe(false)
  expect(init.method).toBe('DELETE')
  expect(init.body).toBeUndefined()
})

it.each([401, 403])('preserves the server deletion denial %s', async (status) => {
  if (status === 401) jar.get.mockReturnValue(undefined)
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: { code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status }))
  const response = await DELETE(new Request(`http://localhost/api/tracks/${id}`, { method: 'DELETE', headers: trusted }) as NextRequest, context)
  expect(response.status).toBe(status)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect((await response.json()).error.code).toBe(status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN')
  const forwardedToken = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('authorization')
  expect(forwardedToken).toBe(status === 401 ? null : `Bearer ${token}`)
})

it('rejects cross-site deletion before forwarding', async () => {
  const response = await DELETE(new Request(`http://localhost/api/tracks/${id}`, {
    method: 'DELETE', headers: { ...trusted, origin: 'https://foreign.example' },
  }) as NextRequest, context)
  expect(response.status).toBe(403)
  expect(fetch).not.toHaveBeenCalled()
})
