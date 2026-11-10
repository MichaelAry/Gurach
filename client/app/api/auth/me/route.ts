import { proxySessionBackend } from '@/lib/server/session'
export async function GET(request: Request) {
  const response = await proxySessionBackend('/auth/me', { signal: request.signal })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
