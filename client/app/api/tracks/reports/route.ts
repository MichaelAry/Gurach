import { proxySessionBackend } from '@/lib/server/session'
export async function GET(request: Request) {
  return proxySessionBackend('/tracks/reports', { signal: request.signal })
}
