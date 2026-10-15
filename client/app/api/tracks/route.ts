// app/api/tracks/route.ts
import { connection } from 'next/server'
import type { NextRequest } from 'next/server'
import type { ITrack } from '@/types/track'

const API_URL = process.env.API_URL ?? 'http://localhost:5000'

/**
 * GET /api/tracks
 *
 * Проксирует запрос списка треков к Nest-бэкенду.
 * Явно помечен как динамический через `connection()` —
 * это замена устаревшему `export const dynamic = 'force-dynamic'`
 * в модели Cache Components (Next.js 16+).
 */
export async function GET(_request: NextRequest) {
  // Сообщаем Next.js: роут выполняется на каждый запрос, не кэшируется на билде.
  // Вызывать нужно в самом начале, до любых I/O и side-effects.
  await connection()

  try {
    const res = await fetch(`${API_URL}/tracks`, {
      // В route handler кэш контролируется через 'use cache' в других слоях,
      // здесь нам нужен свежий ответ от Nest.
      cache: 'no-store',
    })

    if (!res.ok) {
      return Response.json(
        { error: `Upstream error: ${res.status}` },
        { status: 502 },
      )
    }

    const tracks: ITrack[] = await res.json()
    return Response.json(tracks)
  } catch (error) {
    console.error('[GET /api/tracks]', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}