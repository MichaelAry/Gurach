import type { components } from '@/lib/api/schema'
import { formatApiError, readApiError } from '@/lib/api/error'
export async function resolveTracks(ids: readonly string[], signal?: AbortSignal): Promise<components['schemas']['ResolveTracksResponse']> {
  const unique = [...new Set(ids.map((id) => id.toLowerCase()))]
  if (!unique.length) return { items: [] }
  if (unique.length > 100 || unique.some((id) => !/^[a-f\d]{24}$/.test(id))) throw new Error('Некорректный список треков')
  const response = await fetch('/api/tracks/resolve', { method: 'POST', cache: 'no-store', signal,
    headers: { 'content-type': 'application/json', 'X-Gurach-Request': '1' }, body: JSON.stringify({ ids: unique }) })
  if (!response.ok) throw new Error(formatApiError((await readApiError(response))?.error ?? null, 'Не удалось проверить доступность треков'))
  return response.json()
}
