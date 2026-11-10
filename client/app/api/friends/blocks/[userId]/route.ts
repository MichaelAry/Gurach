import { socialProxy, socialInvalid, socialObjectId } from '@/lib/server/social-bff'
type Context = { params: Promise<{ userId: string }> }
async function handle(request: Request, { params }: Context) {
  const { userId } = await params
  if (!socialObjectId.test(userId)) return socialInvalid()
  return socialProxy(request, `/friends/blocks/${userId}`, { revision: true })
}
export const PUT = handle
export const DELETE = handle
