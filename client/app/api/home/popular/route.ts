import { validateHomeQuery } from '@/lib/server/home-query'
import { connection } from 'next/server'
import { proxyBackend } from '@/lib/server/backend'
export async function GET(request: Request) {
  await connection()
  const error = validateHomeQuery(request, [])
  if (error) {
    error.headers.set('Cache-Control', 'no-store')
    return error
  }
  const query = new URL(request.url).searchParams
  const response = await proxyBackend(
    '/home/popular' + (query.size ? '?' + query : ''),
    { signal: request.signal },
  )
  response.headers.set('Cache-Control', 'no-store')
  return response
}
