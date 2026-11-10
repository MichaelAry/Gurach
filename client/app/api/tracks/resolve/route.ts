import { checkBrowserMutation } from '@/lib/server/csrf'
import { readBoundedJson } from '@/lib/server/bounded-json'
import { proxyBackend } from '@/lib/server/backend'
import { apiErrorResponse } from '@/lib/server/api-error-response'

export async function POST(request: Request) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  let value: unknown
  try { value = await readBoundedJson(request) } catch (error) {
    return apiErrorResponse(error instanceof RangeError ? 413 : 400, error instanceof RangeError ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR', 'Invalid resolver body')
  }
  if (!value || typeof value !== 'object' || !('ids' in value) || !Array.isArray(value.ids) || value.ids.length < 1 || value.ids.length > 100 ||
    value.ids.some((id: unknown) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) ||
    new Set(value.ids.map((id: string) => id.toLowerCase())).size !== value.ids.length) return apiErrorResponse(400, 'VALIDATION_ERROR', 'Expected 1 to 100 distinct track IDs')
  return proxyBackend('/tracks/resolve', { method: 'POST', signal: request.signal, body: JSON.stringify({ ids: value.ids }),
    headers: { 'content-type': 'application/json', 'x-request-id': request.headers.get('x-request-id') ?? '' } })
}
