import type { components } from '@/lib/api/schema'
import { formatApiError, readApiError } from '@/lib/api/error'
import type { TrackDetail } from '../types'

export type TrackMetadataUpdate = components['schemas']['UpdateTrackDto']

async function trackResponse(response: Response): Promise<TrackDetail> {
  if (!response.ok) {
    const payload = await readApiError(response)
    const messages: Record<number, string> = {
      400: 'Проверьте название, исполнителя и текст песни.',
      401: 'Сессия истекла. Войдите в аккаунт снова.',
      403: 'У вас нет права редактировать этот трек.',
      404: 'Трек больше недоступен.',
      409: 'Активный трек с таким названием и исполнителем уже существует.',
    }
    throw new Error(messages[response.status] ?? formatApiError(payload?.error ?? null, 'Не удалось сохранить изменения. Попробуйте снова.'))
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
