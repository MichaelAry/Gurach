// features/tracks/api/getTrack.ts
import type { ITrack } from '@/types/track'
import { cacheLife } from 'next/cache'

const API_URL = process.env.API_URL ?? 'http://localhost:5000'

/**
 * Возвращает трек по id или null, если не найден.
 *
 * Кэшируется на уровне Next.js через директиву `'use cache'`.
 * `cacheLife('minutes')` — ближайший аналог старого `revalidate: 60`.
 * Доступные пресеты: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max'.
 * Кастомный профиль: cacheLife({ revalidate: 60, expire: 3600 }).
 *
 * Если бэкенд недоступен, возвращает null.
 */
export async function getTrack(id: string): Promise<ITrack | null> {
  'use cache'
  cacheLife('minutes')

  try {
    const res = await fetch(`${API_URL}/tracks/${id}`)

    if (res.status === 404) return null
    if (!res.ok) {
      console.error(`[getTrack] Upstream error: ${res.status}`)
      return null
    }

    const track: ITrack = await res.json()
    // Сервер отдаёт `_id` — раньше здесь была проверка `track?._id`,
    // из-за которой даже найденный трек превращался в null (404).
    return track ?? null
  } catch (error) {
    console.error('[getTrack] Fetch failed:', error)
    return null
  }
}
