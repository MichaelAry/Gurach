import { validateHomeQuery } from '@/lib/server/home-query'
import { connection } from 'next/server'
import { publicHomeResponse } from '@/lib/server/home-public'
export async function GET(request: Request) {
  await connection()
  const error = validateHomeQuery(request, ['cursor'])
  if (error) {
    error.headers.set('Cache-Control', 'no-store')
    return error
  }
  return publicHomeResponse(request, 'releases')
}
