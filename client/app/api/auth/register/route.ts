import { proxyBackend } from '@/lib/server/backend'
import { checkBrowserMutation } from '@/lib/server/csrf'
import { apiErrorResponse } from '@/lib/server/api-error-response'

export async function POST(request: Request) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  let body
  try { body = await request.json() } catch { return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid JSON') }
  if (!body || typeof body.username !== 'string' || typeof body.displayName !== 'string' || typeof body.password !== 'string' || body.username.length > 32 || body.displayName.length > 64 || body.password.length > 512) return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid registration format')
  return proxyBackend('/auth/register', { method: 'POST', signal: request.signal, headers: { 'content-type': 'application/json', 'x-request-id': request.headers.get('x-request-id') ?? '' }, body: JSON.stringify(body) })
}
