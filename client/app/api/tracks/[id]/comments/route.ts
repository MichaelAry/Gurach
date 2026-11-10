import { checkBrowserMutation } from '@/lib/server/csrf'
import { proxySessionBackend } from '@/lib/server/session'
import { connection, type NextRequest } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error-response'
import { proxyBackend } from '@/lib/server/backend'

interface RouteContext {
  params: Promise<{ id: string }>
}

const ALLOWED_QUERY = new Set(['count', 'cursor'])
const ALLOWED_BODY = ['text', 'rating'] as const

export async function GET(request: NextRequest, { params }: RouteContext) {
  await connection()
  const { id } = await params
  const query = new URLSearchParams()
  for (const name of request.nextUrl.searchParams.keys()) {
    if (!ALLOWED_QUERY.has(name)) {
      return apiErrorResponse(400, 'VALIDATION_ERROR', 'Unsupported query parameter', request.headers.get('x-request-id'))
    }
  }
  for (const name of ALLOWED_QUERY) {
    for (const value of request.nextUrl.searchParams.getAll(name)) query.append(name, value)
  }
  return proxyBackend(`/tracks/${encodeURIComponent(id)}/comments${query.size ? `?${query}` : ''}`, {
    signal: request.signal,
    headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' },
  })
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  await connection()
  const { id } = await params
  let value: unknown
  try {
    value = await request.json()
  } catch {
    return apiErrorResponse(400, 'VALIDATION_ERROR', 'Request body must be valid JSON', request.headers.get('x-request-id'))
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return apiErrorResponse(400, 'VALIDATION_ERROR', 'Request body must be an object', request.headers.get('x-request-id'))
  }
  const source = value as Record<string, unknown>
  const body = Object.fromEntries(ALLOWED_BODY
    .filter((name) => Object.hasOwn(source, name))
    .map((name) => [name, source[name]]))
  return proxySessionBackend(`/tracks/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    body: JSON.stringify(body),
    signal: request.signal,
    headers: {
      'content-type': 'application/json',
      'x-request-id': request.headers.get('x-request-id') ?? '',
    },
  })
}
