import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { proxyBackend, connection } = vi.hoisted(() => ({
  proxyBackend: vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
  connection: vi.fn(async () => undefined),
}))

vi.mock('@/lib/server/csrf', () => ({ checkBrowserMutation: () => null }))
vi.mock('@/lib/server/session', () => ({ proxySessionBackend: proxyBackend }))
vi.mock('next/server', () => ({ connection }))
vi.mock('@/lib/server/backend', () => ({ proxyBackend }))

import { DELETE } from './route'

describe('comment deletion BFF route', () => {
  beforeEach(() => { proxyBackend.mockClear() })

  it('forwards the comment ID and request ID to the backend', async () => {
    const request = new Request('http://local/api/comments/507f1f77bcf86cd799439011', {
      method: 'DELETE', headers: { 'x-request-id': 'client:123' },
    }) as NextRequest
    const response = await DELETE(request, { params: Promise.resolve({ id: '507f1f77bcf86cd799439011' }) })
    expect(response.status).toBe(200)
    expect(proxyBackend).toHaveBeenCalledWith(
      '/comments/507f1f77bcf86cd799439011',
      expect.objectContaining({ method: 'DELETE', headers: { 'x-request-id': 'client:123' } }),
    )
  })
})
