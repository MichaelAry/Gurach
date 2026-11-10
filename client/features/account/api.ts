import { formatApiError, readApiError } from '@/lib/api/error'
import type { components } from '@/lib/api/schema'

export type AccountStatistics = components['schemas']['AccountStatistics']
export type HistoryItem = components['schemas']['AccountHistoryItem']
export type AccountPage<T> = { items: T[]; nextCursor: string | null }

export async function getAccountData<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/account/${path}`, { cache: 'no-store', signal })
  if (!response.ok) {
    const error = await readApiError(response)
    throw new Error(formatApiError(error?.error ?? null, 'Не удалось загрузить данные аккаунта.'))
  }
  return response.json() as Promise<T>
}
