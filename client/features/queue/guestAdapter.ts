import { resolveTracks } from './api/resolveTracks'
import { randomQueueEntries } from './api/randomTracks'
import { QueueTransportError } from './queueStore'
import type { QueueAdapter, QueueEntry, QueueSnapshot, QueueWriteEntry } from './types'

const STORAGE_KEY = 'gurach:guest-queue'
const QUARANTINE_KEY = 'gurach:guest-queue:invalid'
const CHANNEL_NAME = 'gurach:guest-queue'
const LOCK_NAME = 'gurach:guest-queue:write'
export const INVALID_GUEST_QUEUE_WARNING = 'Сохранённая гостевая очередь повреждена или создана другой версией. Исходные данные сохранены; сбросьте их, чтобы начать заново.'
const EMPTY: QueueSnapshot = { revision: 0, capacity: 100, entries: [], updatedAt: null }
type StoredQueue = { version: 1; snapshot: QueueSnapshot; lastMutationId?: string; lastMutationHash?: string }
type GuestAdapterOptions = { onStatus?: (status: { persistent: boolean; warning: string | null }) => void }

function validEntry(value: unknown): value is QueueEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as QueueEntry
  return typeof entry.entryId === 'string' && /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(entry.entryId) &&
    (entry.source === undefined || entry.source === 'manual' || entry.source === 'automatic') &&
    typeof entry.trackId === 'string' && /^[a-f\d]{24}$/i.test(entry.trackId) &&
    Boolean(entry.display && typeof entry.display.name === 'string' && (typeof entry.display.artist === 'string' || entry.display.artist === null)) &&
    (entry.availability === 'playable' || entry.availability === 'unavailable') &&
    (entry.reason === null || entry.reason === 'deleted' || entry.reason === 'missing-audio') &&
    (entry.track === null || (typeof entry.track === 'object' && entry.track._id === entry.trackId && typeof entry.track.name === 'string' &&
      (typeof entry.track.audio === 'string' || entry.track.audio === null) && (typeof entry.track.picture === 'string' || entry.track.picture === null) &&
      typeof entry.track.listens === 'number' && Number.isFinite(entry.track.listens) &&
      (entry.track.duration === null || (typeof entry.track.duration === 'number' && Number.isFinite(entry.track.duration)))))
}

export function validateGuestQueue(raw: string | null): QueueSnapshot | null {
  if (!raw || raw.length > 512_000) return raw === null ? EMPTY : null
  try {
    const stored = JSON.parse(raw) as StoredQueue
    const snapshot = stored?.snapshot
    if (stored.version !== 1 || !snapshot || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || snapshot.capacity !== 100 ||
      !Array.isArray(snapshot.entries) || snapshot.entries.length > 100 || !snapshot.entries.every(validEntry) ||
      new Set(snapshot.entries.map((entry) => entry.entryId.toLowerCase())).size !== snapshot.entries.length ||
      (snapshot.updatedAt !== null && (typeof snapshot.updatedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.updatedAt))))) return null
    return snapshot
  } catch { return null }
}

async function hydrate(snapshot: QueueSnapshot, signal?: AbortSignal): Promise<QueueSnapshot> {
  if (!snapshot.entries.length) return snapshot
  const resolved = new Map((await resolveTracks(snapshot.entries.map((entry) => entry.trackId), signal)).items.map((item) => [item.trackId, item]))
  return { ...snapshot, entries: snapshot.entries.map((entry) => {
    const item = resolved.get(entry.trackId)
    return item ? { ...entry, track: item.track, availability: item.availability, reason: item.reason } : { ...entry, track: null, availability: 'unavailable', reason: 'deleted' }
  }) }
}

/** Persistent guest queue only when cross-tab locks and notifications are both supported. */
export function guestQueueAdapter(options: GuestAdapterOptions = {}): QueueAdapter {
  let memory: QueueSnapshot = EMPTY
  let channel: BroadcastChannel | null = null
  let mode: 'unknown' | 'persistent' | 'memory' = 'unknown'
  const listeners = new Set<() => void>()
  const memoryAdapter = async () => {
    if (mode !== 'memory') { mode = 'memory'; options.onStatus?.({ persistent: false, warning: 'Гостевая очередь хранится только в этой вкладке: браузер не поддерживает безопасную синхронизацию или хранилище недоступно.' }) }
  }
  const resolveEntries = async (current: QueueSnapshot, entries: QueueWriteEntry[], signal?: AbortSignal): Promise<QueueSnapshot> => {
    if (entries.length > 100 || new Set(entries.map((entry) => entry.entryId.toLowerCase())).size !== entries.length) throw new QueueTransportError(400, 'Invalid guest queue')
    const previous = new Map(current.entries.map((entry) => [entry.entryId, entry]))
    const resolved = new Map((await resolveTracks(entries.map((entry) => entry.trackId), signal)).items.map((item) => [item.trackId, item]))
    const nextEntries = entries.map((entry) => {
      const old = previous.get(entry.entryId), item = resolved.get(entry.trackId)
      if (old && old.trackId !== entry.trackId) throw new QueueTransportError(400, 'Entry changed')
      if (!old && !item?.track?.audio) throw new QueueTransportError(400, 'Track unavailable')
      return { ...entry, source: entry.source ?? old?.source ?? 'manual', display: old?.display ?? { name: item!.track!.name, artist: item!.track!.artist }, track: item?.track ?? null,
        availability: item?.availability ?? 'unavailable' as const, reason: item ? item.reason : 'deleted' as const }
    })
    return { revision: current.revision + 1, capacity: 100, entries: nextEntries, updatedAt: new Date().toISOString() }
  }
  const persistent = () => {
    if (typeof window === 'undefined' || !navigator.locks || typeof BroadcastChannel === 'undefined') return false
    try { window.localStorage.getItem(STORAGE_KEY); return true } catch { return false }
  }
  const readStored = (): QueueSnapshot => {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const snapshot = validateGuestQueue(raw)
    if (snapshot) return snapshot
    if (raw === null && window.localStorage.getItem(QUARANTINE_KEY) !== null) {
      options.onStatus?.({ persistent: true, warning: INVALID_GUEST_QUEUE_WARNING })
      return EMPTY
    }
    if (raw !== null) {
      try { if (raw.length <= 512_000) window.localStorage.setItem(QUARANTINE_KEY, raw) } catch { /* Keep the original key untouched when quarantine is unavailable. */ }
      options.onStatus?.({ persistent: true, warning: INVALID_GUEST_QUEUE_WARNING })
      window.localStorage.removeItem(STORAGE_KEY)
    }
    return EMPTY
  }
  const lock = <T,>(work: () => Promise<T>) => navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, work)
  const openChannel = () => {
    if (!channel) {
      channel = new BroadcastChannel(CHANNEL_NAME)
      channel.onmessage = () => listeners.forEach((listener) => listener())
      window.addEventListener('storage', onStorage)
    }
  }
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) listeners.forEach((listener) => listener()) }
  const onOnline = () => listeners.forEach((listener) => listener())
  return {
    load: async (signal) => {
      if (mode === 'memory' || !persistent()) {
        await memoryAdapter()
        if (memory.revision === 0) memory = { ...EMPTY, revision: 1, entries: await randomQueueEntries(signal), updatedAt: new Date().toISOString() }
        return memory
      }
      let cached: QueueSnapshot
      try {
        openChannel(); mode = 'persistent'; options.onStatus?.({ persistent: true, warning: null })
        cached = readStored()
      } catch {
        await memoryAdapter(); return memory
      }
      if (cached.revision === 0 && !cached.entries.length && window.localStorage.getItem(QUARANTINE_KEY) === null) {
        cached = await lock(async () => {
          const current = readStored()
          if (current.revision !== 0 || current.entries.length || window.localStorage.getItem(QUARANTINE_KEY) !== null) return current
          const entries = await randomQueueEntries(signal)
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
          const snapshot: QueueSnapshot = { ...EMPTY, revision: 1, entries, updatedAt: new Date().toISOString() }
          try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, snapshot } satisfies StoredQueue)) }
          catch { await memoryAdapter() }
          memory = snapshot
          channel?.postMessage({ revision: snapshot.revision })
          return snapshot
        })
      }
      try {
        const hydrated = await hydrate(cached, signal)
        memory = hydrated
        return hydrated
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        // Keep the canonical guest data untouched; unverified cached tracks must not become playable offline.
        throw error
      }
    },
    save: async (_revision, _mutationId, entries: QueueWriteEntry[], signal) => {
      if (mode === 'memory' || !persistent()) {
        await memoryAdapter()
        if (memory.revision !== _revision) throw new QueueTransportError(409, 'Guest queue changed')
        memory = await resolveEntries(memory, entries, signal)
        return memory
      }
      return lock(async () => {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        const raw = window.localStorage.getItem(STORAGE_KEY)
        const current = validateGuestQueue(raw) ?? EMPTY
        const mutationHash = JSON.stringify({ revision: _revision, entries })
        const previousSave = raw ? JSON.parse(raw) as StoredQueue : null
        if (previousSave?.lastMutationId === _mutationId) {
          if (previousSave.lastMutationHash !== mutationHash) throw new QueueTransportError(400, 'Mutation changed')
          return hydrate(current, signal)
        }
        if (current.revision !== _revision) throw new QueueTransportError(409, 'Guest queue changed')
        const hydratedCurrent = await hydrate(current, signal)
        const saved = await resolveEntries(hydratedCurrent, entries, signal)
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, snapshot: saved, lastMutationId: _mutationId, lastMutationHash: mutationHash } satisfies StoredQueue))
        } catch {
          await memoryAdapter()
          memory = saved
          return saved
        }
        memory = saved; channel?.postMessage({ revision: saved.revision })
        return saved
      })
    },
    subscribe: (listener) => {
      listeners.add(listener); window.addEventListener('online', onOnline)
      return () => { listeners.delete(listener); window.removeEventListener('online', onOnline) }
    },
  }
}

export function readGuestQueue(): QueueSnapshot | null {
  if (typeof window === 'undefined') return null
  try { return validateGuestQueue(window.localStorage.getItem(STORAGE_KEY)) } catch { return null }
}

export async function loadGuestQueueForImport(signal?: AbortSignal): Promise<QueueSnapshot | null> {
  const snapshot = readGuestQueue()
  return snapshot ? hydrate(snapshot, signal) : null
}

export function guestImportResolved(userId: string): boolean {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem(`gurach:queue-import:${userId}`) === 'done' } catch { return true }
}

export function markGuestImportResolved(userId: string): boolean {
  try { window.localStorage.setItem(`gurach:queue-import:${userId}`, 'done'); return true } catch { return false }
}

export function clearGuestQueue(): boolean {
  try { window.localStorage.removeItem(STORAGE_KEY); window.localStorage.removeItem(QUARANTINE_KEY); return true } catch { return false }
}

export function guestQueuePersistenceAvailable(): boolean {
  if (typeof window === 'undefined' || !navigator.locks || typeof BroadcastChannel === 'undefined') return false
  try { window.localStorage.getItem(STORAGE_KEY); return true } catch { return false }
}
