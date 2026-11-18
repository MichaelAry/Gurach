import 'server-only'
import { proxyBackend } from './backend'
import { apiErrorResponse } from './api-error-response'
import { checkBrowserMutation } from './csrf'
import { readBoundedJson } from './bounded-json'
import { sessionToken } from './session'

export async function proxyMetadataLookup(request: Request, endpoint: 'search' | 'details') {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  const requestId = request.headers.get('x-request-id')
  const token = await sessionToken()
  if (!token) return apiErrorResponse(401, 'UNAUTHORIZED', 'Sign in required', requestId)
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return apiErrorResponse(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected application/json', requestId)
  }
  let body: unknown
  try {
    body = await readBoundedJson(request, 4096)
  } catch (error) {
    const oversized = error instanceof RangeError
    return apiErrorResponse(oversized ? 413 : 400, oversized ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR',
      'Invalid metadata lookup body', requestId)
  }
  return proxyBackend(`/metadata/${endpoint}`, {
    method: 'POST', signal: request.signal, body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'x-request-id': requestId ?? '' },
    timeoutMs: 10_000,
  }, token)
}
