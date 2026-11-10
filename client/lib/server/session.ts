import 'server-only'
import { cookies } from 'next/headers'
import { proxyBackend, type BackendRequestInit } from './backend'

export const sessionCookieName = () => process.env.NODE_ENV === 'production' ? '__Host-gurach_session' : 'gurach_session'
export const sessionCookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' })
export async function sessionToken(): Promise<string | undefined> {
  const value = (await cookies()).get(sessionCookieName())?.value
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined
}
export async function proxySessionBackend(path: string, init?: BackendRequestInit): Promise<Response> {
  return proxyBackend(path, init, await sessionToken())
}
/** Request-scoped lookup; never put this inside a shared cache. */
export async function getViewerSession() {
  const response = await proxySessionBackend('/auth/me')
  if (response.status === 401) return null
  if (!response.ok) throw new Error('Session lookup failed')
  return response.json()
}
