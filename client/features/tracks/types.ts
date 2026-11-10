import type { components } from '@/lib/api/schema'

/** Transport aliases generated from the checked-in server OpenAPI document. */
export type TrackListItem = components['schemas']['TrackListItem']
export type TrackDetail = components['schemas']['TrackDetail']
export type TrackListPage = components['schemas']['TrackListPage']

/** Player state uses list-safe fields and optional detail lyrics. */
export type PlayableTrack = Pick<
  TrackDetail,
  '_id' | 'name' | 'artist' | 'audio' | 'picture' | 'listens' | 'duration'
> & { lyrics?: TrackDetail['lyrics'] }
