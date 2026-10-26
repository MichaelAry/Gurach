// features/tracks/api/getTracks.ts
import type { ITrack } from '@/types/track'
import { cacheLife, cacheTag } from 'next/cache'

const API_URL = process.env.API_URL ?? 'http://localhost:5000'

/**
 * Список всех треков. Кэш — 5 минут.
 * `cacheTag('tracks')` позволяет инвалидировать кэш после загрузки нового трека
 * через revalidateTag('tracks') в server action.
 *
 * ВАЖНО: при ошибке мы бросаем исключение, а не возвращаем [].
 * Иначе `'use cache'` закэширует пустой массив как «успешный» результат
 * (особенно если бэкенд был недоступен во время `next build`),
 * и вы будете видеть пустой список ещё 5 минут после старта.
 */
export async function getTracks(): Promise<ITrack[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag('tracks')

  const res = await fetch(`${API_URL}/tracks`, {
    cache: 'force-cache',
  })

  if (!res.ok) {
    // Бросаем — это предотвращает кэширование «пустого успеха».
    throw new Error(
      `[getTracks] Upstream error: ${res.status} ${res.statusText} (${API_URL}/tracks)`,
    )
  }

  return res.json() as Promise<ITrack[]>
}
