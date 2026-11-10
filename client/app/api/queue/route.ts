import { checkBrowserMutation } from '@/lib/server/csrf'
import { readBoundedJson } from '@/lib/server/bounded-json'
import { proxySessionBackend } from '@/lib/server/session'
import { apiErrorResponse } from '@/lib/server/api-error-response'

export async function GET(request: Request) {
  const response = await proxySessionBackend('/queue', { signal: request.signal, headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' } })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
export async function PUT(request: Request) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  let value: unknown
  try { value = await readBoundedJson(request) } catch (error) {
    return apiErrorResponse(error instanceof RangeError ? 413 : 400, error instanceof RangeError ? 'PAYLOAD_TOO_LARGE' : 'QUEUE_ENTRY_INVALID', 'Invalid queue body')
  }
  if (!value || typeof value !== 'object' || !('entries' in value) || !Array.isArray(value.entries)) return apiErrorResponse(400, 'QUEUE_ENTRY_INVALID', 'Invalid queue entries')
  if (value.entries.length > 100) return apiErrorResponse(400, 'QUEUE_FULL', 'Queue capacity exceeded')
  const input = value as Record<string, unknown>
  const entries = value.entries.map((entry: unknown) => entry && typeof entry === 'object' && 'entryId' in entry && 'trackId' in entry
    ? { entryId: entry.entryId, trackId: entry.trackId, ...('source' in entry ? { source: entry.source } : {}) } : null)
  const response = await proxySessionBackend('/queue', {
    method: 'PUT', signal: request.signal, headers: { 'content-type': 'application/json', 'x-request-id': request.headers.get('x-request-id') ?? '' },
    body: JSON.stringify({ expectedRevision: input.expectedRevision, mutationId: input.mutationId, entries }),
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
