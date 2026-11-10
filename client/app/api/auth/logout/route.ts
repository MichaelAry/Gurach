import { cookies } from 'next/headers'
import { checkBrowserMutation } from '@/lib/server/csrf'
import { proxySessionBackend, sessionCookieName, sessionCookieOptions } from '@/lib/server/session'

export async function POST(request: Request) {
  const rejected = checkBrowserMutation(request)
  if (rejected) return rejected
  const response = await proxySessionBackend('/auth/logout', { method: 'POST', signal: request.signal })
  // Keep the cookie on failure so the user can retry server-side revocation.
  if (!response.ok && response.status !== 401) return response
  ;(await cookies()).set(sessionCookieName(), '', { ...sessionCookieOptions(), expires: new Date(0), maxAge: 0 })
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })
}
