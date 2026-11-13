import { connection } from 'next/server'
import { proxyBackend } from '@/lib/server/backend'
import { socialInvalid, socialObjectId } from '@/lib/server/social-bff'

export async function GET(request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  await connection()
  const { id, commentId } = await params
  if (!socialObjectId.test(id) || !socialObjectId.test(commentId) || new URL(request.url).search) return socialInvalid()
  return proxyBackend(`/tracks/${id}/comments/${commentId}`, { signal: request.signal })
}
