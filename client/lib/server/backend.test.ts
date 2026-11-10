import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { proxyBackend } = await import('./backend')

afterEach(() => vi.unstubAllGlobals())

it('bounds upstream bodies and drops supplied browser authorization', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(1024 * 1024 + 1))))
  const response = await proxyBackend('/tracks', { headers: { authorization: 'Bearer forged' } })
  expect(response.status).toBe(502)
  expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).has('authorization')).toBe(false)
})

describe('backend proxy error transport', () => {
  it('preserves upstream 4xx envelope, request ID and Retry-After', async () => {
    const upstream = Response.json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid query', requestId: 'api-123' },
    }, { status: 400, headers: { 'x-request-id': 'api-123', 'retry-after': '3' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstream))

    const response = await proxyBackend('/tracks?count=bad', {
      headers: { 'x-request-id': 'web-123', cookie: 'private=value' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid query', requestId: 'api-123' },
    })
    expect(response.headers.get('x-request-id')).toBe('api-123')
    expect(response.headers.get('retry-after')).toBe('3')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(new Headers(init?.headers).get('x-request-id')).toBe('web-123')
    expect(new Headers(init?.headers).has('cookie')).toBe(false)
  })

  it('maps upstream 5xx failures to the stable 502 envelope and preserves Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('private upstream details', {
        status: 503,
        headers: { 'x-request-id': 'api-503', 'retry-after': '10' },
      }),
    ))

    const response = await proxyBackend('/tracks')
    expect(response.status).toBe(502)
    const body = await response.text()
    expect(JSON.parse(body)).toMatchObject({
      error: { code: 'BACKEND_UNAVAILABLE', requestId: 'api-503' },
    })
    expect(response.headers.get('retry-after')).toBe('10')
    expect(body).not.toContain('private upstream details')
  })

  it('maps timeout failures to 504 and rethrows caller cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')))
    const timeout = await proxyBackend('/tracks')
    expect(timeout.status).toBe(504)
    expect((await timeout.json()).error.code).toBe('BACKEND_TIMEOUT')

    const controller = new AbortController()
    controller.abort()
    await expect(proxyBackend('/tracks', { signal: controller.signal })).rejects.toThrow()
  })
})
