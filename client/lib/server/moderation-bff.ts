import 'server-only'
import { checkBrowserMutation } from './csrf'
import { readBoundedJson } from './bounded-json'
import { apiErrorResponse } from './api-error-response'
import { proxySessionBackend } from './session'
import { invalidateTrackCaches } from './track-cache'

export async function moderateTrack(request: Request, id: string, action: 'reports' | 'unpublish') {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  if (!/^[a-f\d]{24}$/i.test(id)) return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid track')
  let body: unknown
  try { body = await readBoundedJson(request, 16384) } catch { return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid report') }
  if (!body || typeof body !== 'object' || !('reason' in body) || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 2000) return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid reason')
  const response = await proxySessionBackend(`/tracks/${id}/${action}`, {
    method: 'POST', signal: request.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: body.reason }),
  })
  if (response.ok && action === 'unpublish') invalidateTrackCaches(id)
  return response
}
