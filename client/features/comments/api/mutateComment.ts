import type { components } from '@/lib/api/schema'
import type { CommentResponse } from '../types'
import { formatApiError, readApiError } from '@/lib/api/error'

export type CreateComment = components['schemas']['CreateCommentDto']
export async function commentRequest(path: string, method = 'GET', body?: CreateComment, signal?: AbortSignal): Promise<CommentResponse> {
  const response = await fetch(`/api${path}`, {
    method, signal, cache: 'no-store', credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'X-Gurach-Request': '1', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    const payload = await readApiError(response)
    throw new Error(response.status === 401 ? 'Сессия истекла. Войдите снова; черновик сохранён.' : formatApiError(payload?.error ?? null, 'Не удалось выполнить запрос'))
  }
  return response.json()
}
