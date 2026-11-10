import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { proxyBackend, apiErrorResponse, connection } = vi.hoisted(() => ({
  proxyBackend: vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
  apiErrorResponse: vi.fn((status: number, code: string, message: string) => Response.json({ status, code, message }, { status })),
  connection: vi.fn(async () => undefined),
}))

vi.mock('@/lib/server/csrf', () => ({ checkBrowserMutation: () => null }))
vi.mock('@/lib/server/session', () => ({ proxySessionBackend: proxyBackend }))
vi.mock('next/server', () => ({ connection }))
vi.mock('@/lib/server/backend', () => ({ proxyBackend }))
vi.mock('@/lib/server/api-error-response', () => ({ apiErrorResponse }))

import { GET, POST } from './route'

function nextRequest(url: string, init?: RequestInit): NextRequest {
  const request = new Request(url, init) as NextRequest
  Object.defineProperty(request, 'nextUrl', { value: new URL(url) })
  return request
}

const context = { params: Promise.resolve({ id: '507f1f77bcf86cd799439011' }) }

describe('track comments BFF route', () => {
  beforeEach(() => {
    proxyBackend.mockClear()
    apiErrorResponse.mockClear()
    connection.mockClear()
  })

  it('forwards only count and cursor while preserving duplicate validation at the API', async () => {
    await GET(nextRequest('http://local/api/tracks/id/comments?count=5&cursor=abc'), context)
    expect(proxyBackend).toHaveBeenCalledWith(
      '/tracks/507f1f77bcf86cd799439011/comments?count=5&cursor=abc',
      expect.objectContaining({ headers: { 'x-request-id': '' } }),
    )
  })

  it('rejects unapproved filters', async () => {
    const response = await GET(nextRequest('http://local/api/tracks/id/comments?trackId=other'), context)
    expect(response.status).toBe(400)
    expect(proxyBackend).not.toHaveBeenCalled()
  })

  it('forwards only comment DTO fields when creating a comment', async () => {
    await POST(nextRequest('http://local/api/tracks/id/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'Listener', text: 'Hello', rating: 8, trackId: 'other', admin: true }),
    }), context)
    expect(proxyBackend).toHaveBeenCalledWith(
      '/tracks/507f1f77bcf86cd799439011/comments',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Hello', rating: 8 }) }),
    )
  })
})
