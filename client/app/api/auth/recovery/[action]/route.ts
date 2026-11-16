import { proxyBackend } from '@/lib/server/backend'
import { proxySessionBackend } from '@/lib/server/session'
import { checkBrowserMutation } from '@/lib/server/csrf'
import { readBoundedJson } from '@/lib/server/bounded-json'
import { apiErrorResponse } from '@/lib/server/api-error-response'

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  const { action } = await context.params
  if (!['request', 'channel', 'verify', 'reset'].includes(action)) return apiErrorResponse(404, 'NOT_FOUND', 'Unknown recovery action')
  let body: unknown
  try { body = await readBoundedJson(request, 4096) } catch { return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid recovery request') }
  const init = { method: 'POST', signal: request.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
  return action === 'channel' ? proxySessionBackend('/auth/recovery/channel', init) : proxyBackend(`/auth/recovery/${action}`, init)
}
