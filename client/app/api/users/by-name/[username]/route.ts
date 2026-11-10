import { socialProxy, socialInvalid, socialUsername } from '@/lib/server/social-bff'
type Context = { params: Promise<{ username: string }> }
async function handle(request: Request, { params }: Context) {
  const { username } = await params
  if (!socialUsername.test(username)) return socialInvalid()
  return socialProxy(request, `/users/by-name/${username}`, {})
}
export const GET = handle
