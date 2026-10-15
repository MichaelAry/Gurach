// app/api/tracks/[id]/route.ts
import type { ITrack } from '@/types/track'
import type { NextRequest } from 'next/server'
import { connection } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:5000'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/tracks/[id]
 *
 * Проксирует запрос к Nest-бэкенду.
 * Явно помечен как динамический через `connection()` —
 * это замена устаревшему `export const dynamic = 'force-dynamic'`
 * в модели Cache Components (Next.js 16+).
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  // Сообщаем Next.js: роут выполняется на каждый запрос, не кэшируется на билде.
  // Вызывать нужно в самом начале, до любых I/O и side-effects.
  await connection()

  const { id } = await params

  try {
    const res = await fetch(`${API_URL}/tracks/${id}`, {
      // В route handler кэш контролируется через 'use cache' в других слоях,
      // здесь нам нужен свежий ответ от Nest.
      cache: 'no-store',
    })

    if (res.status === 404) {
      return Response.json({ error: 'Track not found' }, { status: 404 })
    }

    if (!res.ok) {
      return Response.json({ error: `Upstream error: ${res.status}` }, { status: 502 })
    }

    const track: ITrack = await res.json()
    return Response.json(track)
  } catch (error) {
    console.error('[GET /api/tracks/:id]', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST оставляем задел на будущее (лайк/коммент).
// POST автоматически динамический — читает request body, connection() не нужен.
// export async function POST(request: NextRequest, { params }: RouteContext) {
//   const { id } = await params
//   const body = await request.json()
//   // ...
// }
