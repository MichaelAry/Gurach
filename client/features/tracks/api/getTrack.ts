import { fetchBackend, backendErrorFrom } from '@/lib/server/backend'
import type { TrackDetail } from '../types'
import { cacheLife, cacheTag } from 'next/cache'

/** Only genuine missing resources become null; outages reach the error boundary. */
export async function getTrack(id: string): Promise<TrackDetail | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag(`track:${id}`)

  if (!/^[a-f\d]{24}$/i.test(id)) return null
  const response = await fetchBackend(`/tracks/${encodeURIComponent(id)}`)
  if (!response.ok) {
    const error = await backendErrorFrom(response)
    if (response.status === 404 && error.apiError?.code === 'NOT_FOUND') return null
    throw error
  }
  return response.json() as Promise<TrackDetail>
}
