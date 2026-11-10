import { connection } from 'next/server'
import { proxyBackend } from '@/lib/server/backend'
export async function GET(request: Request) {
  await connection()
  const query = new URL(request.url).searchParams
  const response = await proxyBackend(
    '/home/releases' + (query.size ? '?' + query : ''),
    { signal: request.signal },
  )
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
