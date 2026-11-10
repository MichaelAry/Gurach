import { checkBrowserMutation } from '@/lib/server/csrf'
import { proxySessionBackend } from '@/lib/server/session'
import { connection, type NextRequest } from 'next/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  await connection()
  const { id } = await params
  return proxySessionBackend(`/comments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal: request.signal,
    headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' },
  })
}
