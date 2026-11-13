import { validateHomeQuery } from '@/lib/server/home-query'
import { connection } from 'next/server'
import { proxySessionBackend } from '@/lib/server/session'
export async function GET(request: Request) {
  await connection()
  const error = validateHomeQuery(request, ['cursor'])
  if (error) {
    error.headers.set('Cache-Control', 'private, no-store')
    return error
  }
  const query = new URL(request.url).searchParams
  const response = await proxySessionBackend(
    '/home/activity' + (query.size ? '?' + query : ''),
    { signal: request.signal },
  )
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
