import { proxyBackend } from '@/lib/server/backend'

export async function GET(request: Request) {
  return proxyBackend('/tracks/random', {
    signal: request.signal,
    headers: { 'x-request-id': request.headers.get('x-request-id') ?? '' },
  })
}
