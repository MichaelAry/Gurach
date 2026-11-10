import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { proxyBackend } from '@/lib/server/backend'
import { checkBrowserMutation } from '@/lib/server/csrf'
import { sessionCookieName, sessionCookieOptions } from '@/lib/server/session'
import { apiErrorResponse } from '@/lib/server/api-error-response'

export async function POST(request: Request) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  let body
  try { body = await request.json() } catch { return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid JSON') }
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 32 || body.password.length > 512) {
    return apiErrorResponse(400, 'VALIDATION_ERROR', 'Invalid credentials format')
  }
  const upstream = await proxyBackend('/auth/login', {
    method: 'POST', signal: request.signal,
    headers: { 'content-type': 'application/json', 'x-request-id': request.headers.get('x-request-id') ?? '' },
    body: JSON.stringify({ username: body.username, password: body.password }),
  })
  upstream.headers.set('Cache-Control', 'private, no-store')
  if (!upstream.ok) return upstream
  const result = await upstream.json()
  const expiry = new Date(result.expiresAt)
  if (typeof result.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.token) || !Number.isFinite(expiry.valueOf()) || expiry.valueOf() <= Date.now()) {
    return apiErrorResponse(502, 'BACKEND_UNAVAILABLE', 'Invalid login response')
  }
  const expires = new Date(Math.min(expiry.valueOf(), Date.now() + 7 * 86400000))
  ;(await cookies()).set(sessionCookieName(), result.token, { ...sessionCookieOptions(), expires })
  const user = { id: result.user.id, username: result.user.username, displayName: result.user.displayName, role: result.user.role }
  return NextResponse.json({ user, expiresAt: expires.toISOString() }, { headers: { 'Cache-Control': 'private, no-store', 'x-request-id': upstream.headers.get('x-request-id') ?? '' } })
}
