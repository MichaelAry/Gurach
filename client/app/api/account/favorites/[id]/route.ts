import { checkBrowserMutation } from '@/lib/server/csrf'
import { proxySessionBackend } from '@/lib/server/session'
import { apiErrorResponse } from '@/lib/server/api-error-response'

type Context = { params: Promise<{ id: string }> }
async function mutate(request: Request, { params }: Context) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  const { id } = await params
  if (!/^[a-f\d]{24}$/i.test(id)) return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid track id')
  const response = await proxySessionBackend(`/account/favorites/${id}`, {
    method: request.method, signal: request.signal,
    headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' },
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
export const PUT = mutate
export const DELETE = mutate
