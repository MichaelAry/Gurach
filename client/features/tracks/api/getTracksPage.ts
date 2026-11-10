import { fetchBackend, backendErrorFrom } from '@/lib/server/backend'
import type { TrackListPage } from '../types'
import { cacheLife, cacheTag } from 'next/cache'

/** Cache only the page data; each cursor value gets its own cache entry. */
export async function getTracksPage({
  cursor,
  count = 20,
}: {
  cursor?: string
  count?: number
} = {}): Promise<TrackListPage> {
  'use cache'
  cacheLife('minutes')
  cacheTag('tracks')

  const query = new URLSearchParams({ count: String(count) })
  if (cursor) query.set('cursor', cursor)
  const response = await fetchBackend(`/tracks?${query}`)
  if (!response.ok) throw await backendErrorFrom(response)
  return response.json() as Promise<TrackListPage>
}
