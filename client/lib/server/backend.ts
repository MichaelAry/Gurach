import 'server-only'

import { randomUUID } from 'node:crypto'
import { apiUrl } from '@/config/env'
import type { ApiErrorEnvelope } from '@/lib/api/error'
import { readApiError } from '@/lib/api/error'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

export interface BackendRequestInit extends RequestInit {
  duplex?: 'half'
  timeoutMs?: number
}

function requestIdFrom(headers: Headers): string {
  const supplied = headers.get('x-request-id')
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID()
}

function errorResponse(
  status: 502 | 504,
  code: 'BACKEND_UNAVAILABLE' | 'BACKEND_TIMEOUT',
  requestId: string,
  retryAfter?: string | null,
): Response {
  const body: ApiErrorEnvelope = {
    error: {
      code,
      message: code === 'BACKEND_TIMEOUT' ? 'The backend request timed out' : 'The backend is unavailable',
      requestId,
    },
  }
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'x-request-id': requestId,
      ...(retryAfter ? { 'retry-after': retryAfter } : {}),
    },
  })
}

export class BackendError extends Error {
  constructor(public readonly status: number, public readonly apiError: ApiErrorEnvelope['error'] | null = null) {
    super(apiError
      ? `${apiError.message} [${apiError.code}; request ${apiError.requestId}]`
      : `Backend request failed (${status})`)
    this.name = 'BackendError'
  }
}

export async function backendErrorFrom(response: Response): Promise<BackendError> {
  const payload = await readApiError(response)
  return new BackendError(response.status, payload?.error ?? null)
}

/** Transport only. Feature functions own caching and response contracts. */
export function fetchBackend(
  path: string,
  init: BackendRequestInit = {},
): Promise<Response> {
  const { timeoutMs = 10_000, ...fetchInit } = init
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetch(apiUrl(path), {
    ...fetchInit,
    cache: 'no-store',
    signal,
  })
}

/** Preserve actionable API statuses while hiding upstream server errors. */
export async function proxyBackend(
  path: string,
  init?: BackendRequestInit,
  sessionToken?: string,
): Promise<Response> {
  const incomingHeaders = new Headers(init?.headers)
  const requestId = requestIdFrom(incomingHeaders)
  const headers = new Headers()
  for (const name of ['content-type', 'accept']) {
    const value = incomingHeaders.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('x-request-id', requestId)
  if (sessionToken && /^[A-Za-z0-9_-]{43}$/.test(sessionToken)) headers.set('authorization', `Bearer ${sessionToken}`)
  try {
    const response = await fetchBackend(path, { ...init, headers })
    if (response.status >= 500) {
      return errorResponse(
        502,
        'BACKEND_UNAVAILABLE',
        response.headers.get('x-request-id') ?? requestId,
        response.headers.get('retry-after'),
      )
    }
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' })
    for (const name of ['content-type', 'retry-after', 'x-request-id']) {
      const value = response.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }
    if (!responseHeaders.has('x-request-id')) responseHeaders.set('x-request-id', requestId)
    const body = await boundedText(response)
    return new Response(response.status === 204 ? null : body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (error) {
    if (init?.signal?.aborted) throw error
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return errorResponse(timedOut ? 504 : 502, timedOut ? 'BACKEND_TIMEOUT' : 'BACKEND_UNAVAILABLE', requestId)
  }
}

async function boundedText(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1024 * 1024) throw new Error('Backend response exceeds limit')
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { await reader.cancel().catch(() => undefined) }
}
