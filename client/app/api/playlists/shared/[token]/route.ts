import { playlistProxy } from '@/lib/server/playlists-bff'
import { socialInvalid } from '@/lib/server/social-bff'
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return socialInvalid()
  return playlistProxy(request, `/playlists/shared/${token}`, true)
}
