import { proxySessionBackend } from '@/lib/server/session'
import { checkBrowserMutation } from '@/lib/server/csrf'
import { readBoundedJson } from '@/lib/server/bounded-json'
import { apiErrorResponse } from '@/lib/server/api-error-response'

type Context = { params: Promise<{ resource: string }> }

export async function GET(request: Request, { params }: Context) {
  const { resource } = await params
  if (!['statistics', 'uploads', 'history', 'favorites', 'favorite-ids'].includes(resource)) return apiErrorResponse(404, 'NOT_FOUND', 'Resource not found')
  const search = new URL(request.url).search
  const response = await proxySessionBackend(`/account/${resource}${search}`, {
    signal: request.signal, headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' },
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export async function POST(request: Request, { params }: Context) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  const { resource } = await params
  if (resource !== 'listens') return apiErrorResponse(404, 'NOT_FOUND', 'Resource not found')
  let input: unknown
  try { input = await readBoundedJson(request) } catch (error) {
    return apiErrorResponse(error instanceof RangeError ? 413 : 400, error instanceof RangeError ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR', 'Invalid listen body')
  }
  if (!input || typeof input !== 'object' || !('trackId' in input) || !('playbackId' in input) ||
    typeof input.trackId !== 'string' || !/^[a-f\d]{24}$/i.test(input.trackId) ||
    typeof input.playbackId !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(input.playbackId)) {
    return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid listen identity')
  }
  const response = await proxySessionBackend('/account/listens', {
    method: 'POST', signal: request.signal,
    headers: { 'content-type': 'application/json', 'x-request-id': request.headers.get('x-request-id') ?? '' },
    body: JSON.stringify({ trackId: input.trackId, playbackId: input.playbackId }),
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
