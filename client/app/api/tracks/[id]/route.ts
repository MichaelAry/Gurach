import { checkBrowserMutation } from '@/lib/server/csrf'
import { proxySessionBackend } from '@/lib/server/session'
import { connection, type NextRequest } from 'next/server'
import { proxyBackend } from '@/lib/server/backend'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  await connection()
  const { id } = await params
  return proxyBackend(`/tracks/${encodeURIComponent(id)}`, {
    signal: request.signal,
    headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' },
  })
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  await connection()
  const { id } = await params
  return proxySessionBackend(`/tracks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal: request.signal,
    headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' },
  })
}
