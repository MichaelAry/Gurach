import { revalidateTag } from 'next/cache'

/** Shared by browser mutations and durable events, including public home data tagged tracks. */
export function invalidateTrackCaches(trackId?: string, options: { comments?: boolean } = {}) {
  revalidateTag('tracks', { expire: 0 })
  if (trackId && /^[a-f\d]{24}$/i.test(trackId)) {
    const id = trackId.toLowerCase()
    revalidateTag(`track:${id}`, { expire: 0 })
    if (options.comments) revalidateTag(`track-comments:${id}`, { expire: 0 })
  }
}
