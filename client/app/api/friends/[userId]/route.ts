import { socialProxy, socialInvalid, socialObjectId } from '@/lib/server/social-bff'
type Context = { params: Promise<{ userId: string }> }
async function handle(request: Request, { params }: Context) {
  const { userId } = await params
  if (!socialObjectId.test(userId)) return socialInvalid()
  return socialProxy(request, `/friends/${userId}`, { revision: true })
}
export const DELETE = handle
