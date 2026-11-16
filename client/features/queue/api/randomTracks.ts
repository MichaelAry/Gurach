import { message as localMessage } from '@/i18n/messages'
import type { PlayableTrack } from '@/features/tracks/types'
import { formatApiError, readApiError } from '@/lib/api/error'
import { createOccurrence } from '../commands'

export async function randomQueueEntries(signal?: AbortSignal) {
  const response = await fetch('/api/tracks/random', { cache: 'no-store', signal })
  if (!response.ok) throw new Error(formatApiError((await readApiError(response))?.error ?? null, localMessage('couldNotCreateARandomQueue')))
  const tracks: PlayableTrack[] = await response.json()
  return tracks.map((track) => ({ ...createOccurrence(track), source: 'automatic' as const }))
}
