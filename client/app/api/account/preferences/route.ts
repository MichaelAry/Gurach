import { proxySessionBackend } from '@/lib/server/session'
import { checkBrowserMutation } from '@/lib/server/csrf'
import { readBoundedJson } from '@/lib/server/bounded-json'
import { apiErrorResponse } from '@/lib/server/api-error-response'
import { isLocale } from '@/i18n/messages'
export async function GET(request: Request) {
  const response = await proxySessionBackend('/account/preferences', { signal: request.signal })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
export async function PUT(request: Request) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  let body: unknown
  try { body = await readBoundedJson(request, 1024) } catch { return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid preferences') }
  if (!body || typeof body !== 'object' || !('preferredLocale' in body) || !isLocale(body.preferredLocale)
    || ('initialize' in body && typeof body.initialize !== 'boolean')
    || Object.keys(body).some(key => !['preferredLocale', 'initialize'].includes(key))) return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid preferences')
  const response = await proxySessionBackend('/account/preferences', {
    method: 'PUT', signal: request.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
