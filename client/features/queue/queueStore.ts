import { queueReducer } from './queueReducer'
import type { QueueAdapter, QueueCommand, QueueSnapshot, QueueEntry } from './types'
export class QueueTransportError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}
export interface QueueState {
  canonical: QueueSnapshot
  preview: QueueEntry[] | null
  selectedEntryId: string | null
  status: 'loading' | 'ready' | 'pending' | 'error' | 'conflict'
  error: string | null
}
const empty = (): QueueSnapshot => ({ revision: 0, capacity: 100, entries: [], updatedAt: null })
const canSelect = (entry: QueueEntry) => entry.availability === 'playable' && Boolean(entry.track?.audio)
export class QueueStore {
  private readonly serverSnapshot: QueueState = { canonical: empty(), preview: null, selectedEntryId: null, status: 'loading', error: null }
  private state: QueueState = this.serverSnapshot
  private readonly listeners = new Set<() => void>()
  private controller?: AbortController
  private generation = 0
  private pending?: { mutationId: string; revision: number; entries: QueueEntry[]; selectedEntryId: string | null }
  private unsubscribe?: () => void
  constructor(private readonly adapter: QueueAdapter, private readonly uuid: () => string = () => crypto.randomUUID()) {}
  getSnapshot = () => this.state
  getServerSnapshot = () => this.serverSnapshot
  hasPendingMutation = () => Boolean(this.pending)
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<QueueState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((listener) => listener()) }
  async start() { this.unsubscribe?.(); this.unsubscribe = this.adapter.subscribe?.(() => { void this.refresh() }); await this.refresh() }
  dispose() { this.generation++; this.controller?.abort(); this.unsubscribe?.(); this.listeners.clear() }
  async refresh() {
    if (this.state.status === 'pending' || this.pending) return
    const generation = ++this.generation
    this.controller?.abort()
    this.controller = new AbortController()
    try {
      const snapshot = await this.adapter.load(this.controller.signal)
      if (generation !== this.generation || snapshot.revision < this.state.canonical.revision) return
      const selectedEntryId = snapshot.entries.some((entry) => entry.entryId === this.state.selectedEntryId && canSelect(entry)) ? this.state.selectedEntryId : null
      this.publish({ canonical: snapshot, selectedEntryId, preview: null, status: 'ready', error: null })
    } catch (error) {
      if (generation === this.generation) {
        if (error instanceof QueueTransportError && error.status === 401) this.publish({ canonical: empty(), selectedEntryId: null, preview: null })
        this.publish({ status: 'error', error: String(error) })
      }
    }
  }
  select(entryId: string | null) {
    if (this.state.status === 'pending') return false
    if (entryId && !this.state.canonical.entries.some((entry) => entry.entryId === entryId && entry.availability === 'playable')) return false
    this.publish({ selectedEntryId: entryId }); return true
  }
  async dispatch(command: QueueCommand): Promise<boolean> {
    if (this.state.status !== 'ready' || this.pending) return false
    const result = queueReducer(this.state.canonical.entries, this.state.selectedEntryId, command)
    if (!result.ok) { this.publish({ error: result.code }); return false }
    this.pending = { mutationId: this.uuid(), revision: this.state.canonical.revision, entries: result.entries, selectedEntryId: result.selectedEntryId }
    return this.savePending()
  }
  async retry(): Promise<boolean> { return this.pending && this.state.status === 'error' ? this.savePending() : false }
  private async savePending(): Promise<boolean> {
    const pending = this.pending!
    const generation = ++this.generation
    this.controller?.abort(); this.controller = new AbortController()
    this.publish({ status: 'pending', preview: pending.entries, error: null })
    try {
      const saved = await this.adapter.save(pending.revision, pending.mutationId, pending.entries.map(({ entryId, trackId, source }) => ({ entryId, trackId, source })), this.controller.signal)
      if (generation !== this.generation) return false
      if (saved.revision < this.state.canonical.revision) throw new Error('Stale queue response')
      this.pending = undefined
      this.publish({ canonical: saved, selectedEntryId: saved.entries.some((entry) => entry.entryId === pending.selectedEntryId && canSelect(entry)) ? pending.selectedEntryId : null, preview: null, status: 'ready', error: null })
      return true
    } catch (error) {
      if (generation !== this.generation) return false
      if (error instanceof QueueTransportError && error.status === 409) {
        this.pending = undefined
        try {
          const canonical = await this.adapter.load(this.controller.signal)
          if (generation !== this.generation) return false
          if (canonical.revision >= this.state.canonical.revision) this.publish({ canonical, selectedEntryId: canonical.entries.some((entry) => entry.entryId === this.state.selectedEntryId && canSelect(entry)) ? this.state.selectedEntryId : null })
        } catch { /* Keep the last confirmed snapshot; caller can explicitly refresh. */ }
        if (generation !== this.generation) return false
        this.publish({ preview: null, status: 'conflict', error: 'Очередь изменена в другом окне. Обновите её перед повтором.' })
      } else {
        if (error instanceof QueueTransportError && [400, 401, 403, 413].includes(error.status)) {
          this.pending = undefined
          if (error.status === 401) this.publish({ canonical: empty(), selectedEntryId: null })
        }
        this.publish({ preview: null, status: 'error', error: error instanceof Error ? error.message : 'Не удалось сохранить очередь' })
      }
      return false
    }
  }
}
