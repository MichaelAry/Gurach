import { socialInvalid, socialObjectId, socialProxy } from '@/lib/server/social-bff'
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!socialObjectId.test(id)) return socialInvalid()
  return socialProxy(request, `/notifications/${id}/read`)
}
