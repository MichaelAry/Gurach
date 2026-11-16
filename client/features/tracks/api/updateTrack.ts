import { message as localMessage } from '@/i18n/messages'
import type { components } from '@/lib/api/schema'
import { formatApiError, readApiError } from '@/lib/api/error'
import type { TrackDetail } from '../types'

export type TrackMetadataUpdate = components['schemas']['UpdateTrackDto']

async function trackResponse(response: Response): Promise<TrackDetail> {
  if (!response.ok) {
    const payload = await readApiError(response)
    const messages: Record<number, string> = {
      400: localMessage('checkTheTitleArtistAndLyrics'),
      401: localMessage('yourSessionExpiredSignInAgain298'),
      403: localMessage('youDoNotHavePermissionToEditThisTrack'),
      404: localMessage('thisTrackIsNoLongerAvailable'),
      409: localMessage('anActiveTrackWithThisTitleAndArtistAlready'),
    }
    throw new Error(messages[response.status] ?? formatApiError(payload?.error ?? null, localMessage('couldNotSaveChangesTryAgain')))
  }
  return response.json() as Promise<TrackDetail>
}

export async function getEditableTrack(id: string, signal: AbortSignal): Promise<TrackDetail> {
  return trackResponse(await fetch(`/api/tracks/${encodeURIComponent(id)}`, { cache: 'no-store', signal }))
}

export async function updateTrack(id: string, body: TrackMetadataUpdate, signal: AbortSignal): Promise<TrackDetail> {
  return trackResponse(await fetch(`/api/tracks/${encodeURIComponent(id)}`, {
    method: 'PATCH', signal, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Gurach-Request': '1' },
    body: JSON.stringify(body),
  }))
}
