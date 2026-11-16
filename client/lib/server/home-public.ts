import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { BackendError, backendErrorFrom, proxyBackend } from './backend'
import { apiErrorResponse } from './api-error-response'
import type { components } from '@/lib/api/schema'

type PublicHomeData =
  components['schemas']['HomeReleasesPage'] | components['schemas']['HomePopularResponse']

async function getPublicHome(
  kind: 'releases' | 'popular',
  cursor: string | null,
): Promise<PublicHomeData> {
  'use cache'
  cacheLife({ stale: 0, revalidate: 15, expire: 30 })
  // Publication, metadata changes and deletion already expire this shared tag.
  cacheTag('tracks')
  const response = await proxyBackend(
    `/home/${kind}` + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''),
  )
  if (!response.ok) throw await backendErrorFrom(response)
  return response.json()
}

export async function publicHomeResponse(request: Request, kind: 'releases' | 'popular') {
  try {
    const data = await getPublicHome(kind, new URL(request.url).searchParams.get('cursor'))
    // Cache the public data on the server; HTTP caches cannot bypass invalidation.
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const status = error instanceof BackendError ? error.status : 502
    return apiErrorResponse(
      status,
      error instanceof BackendError
        ? (error.apiError?.code ?? 'BACKEND_UNAVAILABLE')
        : 'BACKEND_UNAVAILABLE',
      error instanceof BackendError && error.apiError
        ? error.apiError.message
        : 'The backend is unavailable',
      error instanceof BackendError
        ? (error.apiError?.requestId ?? request.headers.get('x-request-id'))
        : request.headers.get('x-request-id'),
    )
  }
}
