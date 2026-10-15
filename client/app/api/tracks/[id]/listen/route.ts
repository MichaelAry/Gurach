// app/api/tracks/[id]/listen/route.ts
import type { NextRequest } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:5000'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/tracks/[id]/listen
 *
 * Проксирует счётчик прослушиваний к Nest-бэкенду. Нужен, чтобы клиент
 * (браузер) ходил в API по тому же origin, что и Next.js, а не напрямую
 * на порт бэкенда. POST не кэшируется, `connection()` не нужен.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const res = await fetch(`${API_URL}/tracks/${id}/listen`, {
      method: 'POST',
    })

    if (res.status === 404) {
      return Response.json({ error: 'Track not found' }, { status: 404 })
    }

    if (!res.ok) {
      return Response.json(
        { error: `Upstream error: ${res.status}` },
        { status: 502 },
      )
    }

    return Response.json({ ok: true })
  } catch (error) {
    console.error('[POST /api/tracks/:id/listen]', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
