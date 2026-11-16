import { moderateTrack } from '@/lib/server/moderation-bff'
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return moderateTrack(request, (await context.params).id, 'reports')
}
