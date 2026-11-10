import 'server-only'
import { checkBrowserMutation } from './csrf'
import { readBoundedJson } from './bounded-json'
import { apiErrorResponse } from './api-error-response'
import { proxySessionBackend } from './session'

export const socialObjectId = /^[a-f\d]{24}$/i
export const socialRequestId = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i
export const socialUsername = /^[a-z0-9_]{3,32}$/i
export function socialInvalid(message = 'Invalid parameters', status: 400 | 413 = 400) {
  const response = apiErrorResponse(status, status === 413 ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR', message)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
export async function socialProxy(request: Request, path: string, options: { list?: boolean; search?: boolean; requests?: boolean; revision?: boolean; body?: boolean } = {}) {
  if (request.method !== 'GET') {
    const rejected = checkBrowserMutation(request)
    if (rejected) { rejected.headers.set('Cache-Control', 'private, no-store'); return rejected }
  }
  const input = new URL(request.url).searchParams
  const output = new URLSearchParams()
  const allowed = [ ...(options.list ? ['count', 'cursor'] : []), ...(options.search ? ['query'] : []), ...(options.requests ? ['direction'] : []), ...(options.revision ? ['expectedRevision'] : []) ]
  for (const key of input.keys()) if (!allowed.includes(key) || input.getAll(key).length !== 1) return socialInvalid()
  if (options.list) {
    const count = input.get('count'), cursor = input.get('cursor')
    if (count !== null && (!/^\d{1,2}$/.test(count) || Number(count) < 1 || Number(count) > 50)) return socialInvalid('Invalid count')
    if (cursor !== null && !/^[A-Za-z0-9_-]{1,512}$/.test(cursor)) return socialInvalid('Invalid cursor')
    if (count) output.set('count', count)
    if (cursor) output.set('cursor', cursor)
  }
  if (options.search) {
    const query = input.get('query')?.trim().toLowerCase()
    if (!query || !/^[a-z0-9_]{2,32}$/.test(query)) return socialInvalid('Invalid search query')
    output.set('query', query)
  }
  if (options.requests) {
    const direction = input.get('direction')
    if (direction !== 'incoming' && direction !== 'outgoing') return socialInvalid('Invalid direction')
    output.set('direction', direction)
  }
  if (options.revision) {
    const revision = input.get('expectedRevision')
    if (revision === null || !/^(0|[1-9]\d{0,15})$/.test(revision) || !Number.isSafeInteger(Number(revision))) return socialInvalid('Invalid expectedRevision')
    output.set('expectedRevision', revision)
  }
  let body: string | undefined
  if (options.body) {
    let data: unknown
    try { data = await readBoundedJson(request) }
    catch (error) { return socialInvalid('Invalid request body', error instanceof RangeError ? 413 : 400) }
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 1 || !('targetUserId' in data) || typeof data.targetUserId !== 'string' || !socialObjectId.test(data.targetUserId)) return socialInvalid('Invalid targetUserId')
    body = JSON.stringify({ targetUserId: data.targetUserId })
  }
  const query = output.toString()
  const response = await proxySessionBackend(`${path}${query ? `?${query}` : ''}`, {
    method: request.method, signal: request.signal,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), 'x-request-id': request.headers.get('x-request-id') ?? '' }, body,
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
