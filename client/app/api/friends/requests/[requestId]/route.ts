import { socialProxy, socialInvalid, socialRequestId } from '@/lib/server/social-bff'
type Context = { params: Promise<{ requestId: string }> }
async function handle(request: Request, { params }: Context) {
  const { requestId } = await params
  if (!socialRequestId.test(requestId)) return socialInvalid()
  return socialProxy(request, `/friends/requests/${requestId}`, {})
}
export const DELETE = handle
