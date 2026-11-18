import { apiUrl } from '@/config/env'
import type { TrackDetail } from '@/features/tracks/types'
import { fetchBackend } from '@/lib/server/backend'

const audioPath = /^\/static\/audio\/[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/

function attachmentName(track: TrackDetail, path: string): string {
  const title = [track.name, track.artist]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim().replace(/[. ]+$/, ''))
    .filter(Boolean)
    .join(' - ')
  const extension = /\.[^.\/]+$/.exec(path)?.[0] ?? ''
  const filename = encodeURIComponent(((title || 'track') + extension).toWellFormed())
    .replace(/['()*]/g, (character) => '%' + character.charCodeAt(0).toString(16))
  return `attachment; filename*=UTF-8''${filename}`
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!/^[a-f0-9]{24}$/i.test(id)) return new Response(null, { status: 404, headers })

  try {
    const metadata = await fetchBackend(`/tracks/${id}`, { signal: request.signal, redirect: 'error' })
    if (!metadata.ok) {
      await metadata.body?.cancel()
      return new Response(null, { status: metadata.status === 404 ? 404 : 502, headers })
    }
    const track: TrackDetail = await metadata.json()
    if (!track.audio) return new Response(null, { status: 404, headers })
    const path = new URL(track.audio).pathname
    if (!audioPath.test(path)) return new Response(null, { status: 404, headers })

    // Resolve the storage path on the configured backend, even when its public origin differs.
    const audio = await fetch(apiUrl(`${path}?download=${id}`), {
      cache: 'no-store',
      headers: { 'Accept-Encoding': 'identity' },
      redirect: 'error',
      signal: request.signal,
    })
    if (!audio.ok || !audio.body) {
      await audio.body?.cancel()
      return new Response(null, { status: audio.status === 404 ? 404 : 502, headers })
    }

    const responseHeaders = new Headers(headers)
    const disposition = audio.headers.get('Content-Disposition')
    responseHeaders.set('Content-Disposition', /^attachment\s*(?:;|$)/i.test(disposition ?? '') && disposition
      ? disposition
      : attachmentName(track, path))
    responseHeaders.set('Content-Type', 'application/octet-stream')
    const length = audio.headers.get('Content-Length')
    if (length && !audio.headers.has('Content-Encoding')) responseHeaders.set('Content-Length', length)
    return new Response(audio.body, { headers: responseHeaders })
  } catch {
    return new Response(null, { status: 502, headers })
  }
}
