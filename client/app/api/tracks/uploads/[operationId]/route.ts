import { connection } from 'next/server'
import { proxySessionBackend, sessionToken } from '@/lib/server/session'
import { apiErrorResponse } from '@/lib/server/api-error-response'
import { invalidateTrackCaches } from '@/lib/server/track-cache'

export async function GET(request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  await connection()
  if (!await sessionToken()) return apiErrorResponse(401, 'UNAUTHORIZED', 'Sign in to inspect uploads')
  const { operationId } = await params
  const response = await proxySessionBackend(`/tracks/uploads/${encodeURIComponent(operationId)}`, { signal: request.signal })
  if (response.ok) {
    const job = await response.clone().json()
    if (job.status === 'published' && /^[a-f\d]{24}$/i.test(job.trackId)) invalidateTrackCaches(job.trackId)
  }
  return response
}
