import 'server-only'
import { apiErrorResponse } from './api-error-response'

/** Preserve query multiplicity until it has been checked at the proxy boundary. */
export function validateHomeQuery(request: Request, allowed: readonly string[]): Response | null {
  const query = new URL(request.url).searchParams
  for (const name of query.keys()) {
    if (!allowed.includes(name) || query.getAll(name).length !== 1) {
      return apiErrorResponse(400, 'VALIDATION_ERROR', 'Unsupported or repeated query parameter', request.headers.get('x-request-id'))
    }
  }
  // The API validates the opaque cursor payload; this boundary enforces its size.
  const cursor = query.get('cursor')
  if (cursor !== null && (cursor.length === 0 || cursor.length > 512)) {
    return apiErrorResponse(400, 'VALIDATION_ERROR', 'Cursor must contain 1 to 512 characters', request.headers.get('x-request-id'))
  }
  return null
}
