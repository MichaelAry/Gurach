import { readApiError, formatApiError } from '@/lib/api/error'
import type { QueueAdapter, QueueSnapshot } from './types'
import { QueueTransportError } from './queueStore'
async function read(response: Response): Promise<QueueSnapshot> {
  if (!response.ok) throw new QueueTransportError(response.status, formatApiError((await readApiError(response))?.error ?? null, 'Не удалось сохранить очередь'))
  const value = await response.json() as QueueSnapshot
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || value.capacity !== 100 || !Array.isArray(value.entries) || value.entries.length > 100 || new Set(value.entries.map((entry) => entry.entryId)).size !== value.entries.length) throw new Error('Некорректный ответ очереди')
  return value
}
export function accountQueueAdapter(): QueueAdapter {
  let channel: BroadcastChannel | null = null
  return {
    load: async (signal) => read(await fetch('/api/queue', { cache: 'no-store', signal })),
    save: async (expectedRevision, mutationId, entries, signal) => {
      const saved = await read(await fetch('/api/queue', {
        method: 'PUT', cache: 'no-store', signal, headers: { 'content-type': 'application/json', 'X-Gurach-Request': '1' },
        body: JSON.stringify({ expectedRevision, mutationId, entries }),
      }))
      channel?.postMessage({ revision: saved.revision })
      return saved
    },
    subscribe: (listener) => {
      const refresh = () => listener()
      channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('gurach:account-queue')
      if (channel) channel.onmessage = refresh
      window.addEventListener('focus', refresh)
      window.addEventListener('online', refresh)
      const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
      document.addEventListener('visibilitychange', onVisibility)
      return () => {
        window.removeEventListener('focus', refresh)
        window.removeEventListener('online', refresh)
        document.removeEventListener('visibilitychange', onVisibility)
        channel?.close(); channel = null
      }
    },
  }
}
