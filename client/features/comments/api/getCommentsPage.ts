import type { CommentPage } from '../types'
import { formatApiError, readApiError } from '@/lib/api/error'

export async function getCommentsPage(
  trackId: string,
  options: { cursor?: string; count?: number; signal?: AbortSignal } = {},
): Promise<CommentPage> {
  const query = new URLSearchParams({ count: String(options.count ?? 20) })
  if (options.cursor) query.set('cursor', options.cursor)
  const response = await fetch(`/api/tracks/${encodeURIComponent(trackId)}/comments?${query}`, {
    signal: options.signal,
    cache: 'no-store',
  })
  if (!response.ok) {
    const payload = await readApiError(response)
    throw new Error(formatApiError(payload?.error ?? null, 'Не удалось загрузить комментарии'))
  }
  const page: unknown = await response.json()
  if (
    typeof page !== 'object' || page === null ||
    !('items' in page) || !Array.isArray(page.items) ||
    !('nextCursor' in page) || !(page.nextCursor === null || typeof page.nextCursor === 'string')
  ) throw new Error('Получен некорректный список комментариев')
  return page as CommentPage
}
