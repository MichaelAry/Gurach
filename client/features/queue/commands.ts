import type { PlayableTrack } from '@/features/tracks/types'
import type { QueueEntry } from './types'
export function createOccurrence(track: PlayableTrack, uuid: () => string = () => crypto.randomUUID()): QueueEntry {
  return { entryId: uuid(), trackId: track._id, source: 'manual', display: { name: track.name, artist: track.artist }, track,
    availability: track.audio ? 'playable' : 'unavailable', reason: track.audio ? null : 'missing-audio' }
}
export { queueReducer as applyQueueCommand } from './queueReducer'
