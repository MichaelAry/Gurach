import { checkBrowserMutation } from '@/lib/server/csrf'
import { proxySessionBackend } from '@/lib/server/session'
import type { NextRequest } from 'next/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  const { id } = await params
  return proxySessionBackend(`/tracks/${encodeURIComponent(id)}/listen`, {
    method: 'POST',
    signal: request.signal,
    headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' },
  })
}
