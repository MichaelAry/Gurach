import { message as localMessage } from '@/i18n/messages'
import { readApiError, formatApiError } from '@/lib/api/error'
import type { QueueAdapter, QueueSnapshot } from './types'
import { QueueTransportError } from './queueStore'
async function read(response: Response): Promise<QueueSnapshot> {
  if (!response.ok) throw new QueueTransportError(response.status, formatApiError((await readApiError(response))?.error ?? null, localMessage('couldNotSaveTheQueue')))
  const value = await response.json() as QueueSnapshot
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || value.capacity !== 100 || !Array.isArray(value.entries) || value.entries.length > 100 || new Set(value.entries.map((entry) => entry.entryId)).size !== value.entries.length) throw new Error(localMessage('invalidQueueResponse'))
  return value
}
export function accountQueueAdapter(isSessionConfirmed: () => boolean): QueueAdapter {
  let channel: BroadcastChannel | null = null
  const assertSession = () => { if (!isSessionConfirmed()) throw new QueueTransportError(503, localMessage('yourSessionCouldNotBeConfirmedCheckYourSession246')) }
  return {
    load: async (signal) => { assertSession(); return read(await fetch('/api/queue', { cache: 'no-store', signal })) },
    save: async (expectedRevision, mutationId, entries, signal) => {
      assertSession()
      const saved = await read(await fetch('/api/queue', {
        method: 'PUT', cache: 'no-store', signal, headers: { 'content-type': 'application/json', 'X-Gurach-Request': '1' },
        body: JSON.stringify({ expectedRevision, mutationId, entries }),
      }))
      channel?.postMessage({ revision: saved.revision })
      return saved
    },
    subscribe: (listener) => {
      const refresh = () => { if (isSessionConfirmed()) listener() }
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
