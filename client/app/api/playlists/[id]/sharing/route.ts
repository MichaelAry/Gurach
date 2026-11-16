import { playlistProxy } from '@/lib/server/playlists-bff'
import { socialInvalid, socialObjectId } from '@/lib/server/social-bff'
async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!socialObjectId.test(id)) return socialInvalid()
  return playlistProxy(request, `/playlists/${id}/sharing`)
}
export { handle as PUT }
