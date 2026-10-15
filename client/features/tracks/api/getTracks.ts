// features/tracks/api/getTracks.ts
import { cacheLife, cacheTag } from 'next/cache'
import type { ITrack } from '@/types/track'

const API_URL = process.env.API_URL ?? 'http://localhost:5000'

/**
 * Список всех треков. Кэш — 5 минут.
 * `cacheTag('tracks')` позволяет инвалидировать кэш после загрузки нового трека
 * через revalidateTag('tracks') в server action.
 *
 * Если бэкенд недоступен (например, во время build), возвращает пустой массив.
 */
export async function getTracks(): Promise<ITrack[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag('tracks')

  try {
    const res = await fetch(`${API_URL}/tracks`)
    if (!res.ok) {
      console.error(`[getTracks] Upstream error: ${res.status}`)
      return []
    }
    return res.json()
  } catch (error) {
    console.error('[getTracks] Fetch failed:', error)
    return []
  }
}