import { connection, type NextRequest } from 'next/server'
import { proxyBackend } from '@/lib/server/backend'
import { apiErrorResponse } from '@/lib/server/api-error-response'

/** Public search proxy; Nest validates values, repeated parameters, and cursor scope. */
export async function GET(request: NextRequest) {
  await connection()
  const query = request.nextUrl.searchParams
  const allowed = ['query', 'name', 'artist', 'text', 'nameOrArtist', 'count', 'cursor']
  for (const name of query.keys()) {
    if (!allowed.includes(name)) {
      return apiErrorResponse(400, 'VALIDATION_ERROR', 'Unsupported query parameter', request.headers.get('x-request-id'))
    }
  }
  return proxyBackend(`/tracks/search?${query}`, {
    signal: request.signal,
    headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' },
  })
}
