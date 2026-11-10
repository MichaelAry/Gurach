import type { components } from '@/lib/api/schema'
export const QUEUE_CAPACITY = 100
export type QueueEntry = components['schemas']['QueueEntryResponseDto']
export type QueueSnapshot = components['schemas']['QueueResponseDto']
export type QueueWriteEntry = Pick<QueueEntry, 'entryId' | 'trackId' | 'source'>
export interface QueueAdapter {
  load(signal?: AbortSignal): Promise<QueueSnapshot>
  save(expectedRevision: number, mutationId: string, entries: QueueWriteEntry[], signal?: AbortSignal): Promise<QueueSnapshot>
  subscribe?(listener: () => void): () => void
}
export type QueueCommand =
  | { type: 'append' | 'play-next' | 'replace'; entries: QueueEntry[] }
  | { type: 'remove'; entryId: string }
  | { type: 'removeMany'; entryIds: string[] }
  | { type: 'removeFirst'; count: number }
  | { type: 'reorder'; entryIds: string[] }
  | { type: 'clear' | 'removeUnavailable' }
export type CommandResult = { ok: true; entries: QueueEntry[]; selectedEntryId: string | null } |
  { ok: false; code: 'QUEUE_FULL' | 'QUEUE_ENTRY_INVALID' }
