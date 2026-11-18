import { COVER_EXTENSIONS_BY_TYPE, MAX_COVER_BYTES } from '@/features/tracks/catalogMetadata'
import { backendHeaders, fetchBackend } from '@/lib/server/backend'
import { sessionToken } from '@/lib/server/session'

export async function GET(request: Request, { params }: { params: Promise<{ releaseMbid: string }> }) {
  const token = await sessionToken()
  const responseHeaders = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
  if (!token) return new Response(null, { status: 401, headers: responseHeaders })
  const { releaseMbid } = await params
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(releaseMbid)) {
    return new Response(null, { status: 400, headers: responseHeaders })
  }
  const headers = await backendHeaders({ headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' } }, token)
  responseHeaders.set('x-request-id', headers.get('x-request-id')!)
  try {
    const response = await fetchBackend(`/metadata/artwork/${releaseMbid}`, { headers, redirect: 'error', signal: request.signal })
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    if (!response.ok || !response.body || !type || !Object.hasOwn(COVER_EXTENSIONS_BY_TYPE, type)
      || Number(response.headers.get('content-length')) > MAX_COVER_BYTES) {
      await response.body?.cancel()
      return new Response(null, { status: [401, 403, 404, 429].includes(response.status) ? response.status : 502, headers: responseHeaders })
    }
    responseHeaders.set('Content-Type', type)
    let bytes = 0
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength
        if (bytes > MAX_COVER_BYTES) throw new Error('Metadata artwork too large')
        controller.enqueue(chunk)
      },
    }))
    return new Response(body, { headers: responseHeaders })
  } catch {
    return new Response(null, { status: 502, headers: responseHeaders })
  }
}
