import { proxySessionBackend } from '@/lib/server/session'
import { checkBrowserMutation } from '@/lib/server/csrf'
import { apiErrorResponse } from '@/lib/server/api-error-response'

type Context = { params: Promise<{ id: string }> }

async function proxy(request: Request, { params }: Context, method: 'GET' | 'PUT') {
  const { id } = await params
  if (!/^[a-f\d]{24}$/i.test(id)) return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid track id')
  const response = await proxySessionBackend(`/account/artwork-wear/${id}`, { method, signal: request.signal })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export function GET(request: Request, context: Context) {
  return proxy(request, context, 'GET')
}

export function PUT(request: Request, context: Context) {
  return checkBrowserMutation(request) ?? proxy(request, context, 'PUT')
}
