import { readBoundedJson } from '@/lib/server/bounded-json'
import { proxyBackend } from '@/lib/server/backend'
import { checkBrowserMutation } from '@/lib/server/csrf'
import { apiErrorResponse } from '@/lib/server/api-error-response'

export async function POST(request: Request) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  if (process.env.PUBLIC_REGISTRATION_ENABLED !== 'true') return apiErrorResponse(403, 'FORBIDDEN', 'Public registration is disabled')
  let body: unknown
  try { body = await readBoundedJson(request, 4096) } catch { return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid JSON') }
  if (!body || typeof body !== 'object' || !('username' in body) || !('password' in body) || !('displayName' in body) || typeof body.username !== 'string' || typeof body.displayName !== 'string' || typeof body.password !== 'string' || body.username.length > 32 || body.displayName.length > 64 || body.password.length > 512) return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid registration format')
  return proxyBackend('/auth/register', { method: 'POST', signal: request.signal, headers: { 'content-type': 'application/json', 'x-request-id': request.headers.get('x-request-id') ?? '' }, body: JSON.stringify({ username: body.username, displayName: body.displayName, password: body.password }) })
}
