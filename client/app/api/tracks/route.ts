import { connection, type NextRequest } from 'next/server'
import { proxyBackend } from '@/lib/server/backend'
import { apiErrorResponse } from '@/lib/server/api-error-response'
import { checkBrowserMutation } from '@/lib/server/csrf'
import { sessionToken } from '@/lib/server/session'
import { revalidateTag } from 'next/cache'

// 50 MiB audio + 10 MiB cover, with room for text fields and multipart headers.
const MAX_UPLOAD_BYTES = 61 * 1024 * 1024

export async function POST(request: Request) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  await connection()
  const requestId = request.headers.get('x-request-id')
  const token = await sessionToken()
  if (!token) return apiErrorResponse(401, 'UNAUTHORIZED', 'Sign in to upload tracks', requestId)

  const contentType = request.headers.get('content-type') ?? ''
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !/;\s*boundary=(?:"[^"\r\n]+"|[^;"\s]+)(?:\s*;|\s*$)/i.test(contentType)) {
    return apiErrorResponse(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected multipart/form-data with a boundary', requestId)
  }
  if (!request.body) return apiErrorResponse(400, 'VALIDATION_ERROR', 'Request body is required', requestId)
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null && !/^\d+$/.test(contentLength)) {
    return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid content length', requestId)
  }
  if (contentLength !== null && Number(contentLength) > MAX_UPLOAD_BYTES) {
    return apiErrorResponse(413, 'PAYLOAD_TOO_LARGE', 'Upload exceeds the request size limit', requestId)
  }

  let size = 0
  let tooLarge = false
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength
      if (size > MAX_UPLOAD_BYTES) {
        tooLarge = true
        throw new RangeError('Upload exceeds the request size limit')
      }
      controller.enqueue(chunk)
    },
  }))
  const response = await proxyBackend('/tracks', {
    method: 'POST',
    body,
    duplex: 'half',
    timeoutMs: 120_000,
    signal: request.signal,
    headers: { 'content-type': contentType, 'x-request-id': requestId ?? '' },
  }, token)
  if (tooLarge) return apiErrorResponse(413, 'PAYLOAD_TOO_LARGE', 'Upload exceeds the request size limit', requestId)
  if (response.status === 201) {
    // Invalidate shared data before the browser opens the newly published track.
    revalidateTag('tracks', { expire: 0 })
    const track: unknown = await response.clone().json().catch(() => null)
    if (track && typeof track === 'object' && '_id' in track && typeof track._id === 'string' && /^[a-f\d]{24}$/i.test(track._id)) {
      revalidateTag(`track:${track._id.toLowerCase()}`, { expire: 0 })
    }
  }
  return response
}

export async function GET(request: NextRequest) {
  await connection()
  const query = new URLSearchParams()
  for (const name of request.nextUrl.searchParams.keys()) {
    if (!['count', 'cursor'].includes(name)) {
      return apiErrorResponse(400, 'VALIDATION_ERROR', 'Unsupported query parameter', request.headers.get('x-request-id'))
    }
  }
  for (const name of ['count', 'cursor']) {
    for (const value of request.nextUrl.searchParams.getAll(name)) {
      query.append(name, value)
    }
  }
  return proxyBackend(`/tracks${query.size ? `?${query}` : ''}`, {
    signal: request.signal,
    headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' },
  })
}
