import { readBoundedJson } from '@/lib/server/bounded-json'
import { apiErrorResponse } from '@/lib/server/api-error-response'
import { invalidateTrackCaches } from '@/lib/server/track-cache'
import { checkBrowserMutation } from '@/lib/server/csrf'
import { proxySessionBackend } from '@/lib/server/session'
import { connection, type NextRequest } from 'next/server'
import { proxyBackend } from '@/lib/server/backend'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  await connection()
  const { id } = await params
  return proxyBackend(`/tracks/${encodeURIComponent(id)}`, {
    signal: request.signal,
    headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' },
  })
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  await connection()
  const { id } = await params
  return proxySessionBackend(`/tracks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal: request.signal,
    headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' },
  })
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  await connection()
  const requestId = request.headers.get('x-request-id')
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    return apiErrorResponse(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected application/json', requestId)
  }
  let body: unknown
  try {
    // 100,000 Unicode lyrics characters, JSON escaping and two bounded display fields.
    body = await readBoundedJson(request, 1024 * 1024)
  } catch (error) {
    return apiErrorResponse(error instanceof RangeError ? 413 : 400,
      error instanceof RangeError ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR', 'Invalid track metadata body', requestId)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !['name', 'artist', 'text'].includes(key))) {
    return apiErrorResponse(400, 'VALIDATION_ERROR', 'Only name, artist and text may be edited', requestId)
  }
  const { id } = await params
  const response = await proxySessionBackend(`/tracks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    signal: request.signal,
    headers: { 'content-type': 'application/json', 'x-request-id': requestId ?? '' },
    body: JSON.stringify(body),
  })
  if (response.ok) invalidateTrackCaches(id)
  return response
}
