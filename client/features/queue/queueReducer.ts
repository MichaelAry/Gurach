import { QUEUE_CAPACITY, type QueueCommand, type QueueEntry, type CommandResult } from './types'
const playable = (entry: QueueEntry) => entry.availability === 'playable' && Boolean(entry.track?.audio)
export function queueReducer(current: readonly QueueEntry[], selectedEntryId: string | null, command: QueueCommand): CommandResult {
  let entries: QueueEntry[]
  switch (command.type) {
    case 'append':
    case 'play-next': {
      let position = selectedEntryId ? current.findIndex((entry) => entry.entryId === selectedEntryId) + 1 : 0
      for (let index = position; index < current.length; index++) {
        if (current[index].source !== 'automatic') position = index + 1
      }
      entries = [...current.slice(0, position), ...command.entries, ...current.slice(position)]
      break
    }
    case 'replace': entries = [...command.entries]; break
    case 'remove': entries = current.filter((entry) => entry.entryId !== command.entryId); break
    case 'removeMany': {
      const removed = new Set(command.entryIds)
      entries = current.filter((entry) => !removed.has(entry.entryId))
      break
    }
    case 'removeFirst': {
      if (!Number.isSafeInteger(command.count) || command.count < 1 || command.count > current.length) return { ok: false, code: 'QUEUE_ENTRY_INVALID' }
      entries = current.slice(command.count)
      break
    }
    case 'clear': entries = []; break
    case 'removeUnavailable': entries = current.filter(playable); break
    case 'reorder': {
      if (command.entryIds.length !== current.length || new Set(command.entryIds).size !== current.length) return { ok: false, code: 'QUEUE_ENTRY_INVALID' }
      const byId = new Map(current.map((entry) => [entry.entryId, entry]))
      if (command.entryIds.some((id) => !byId.has(id))) return { ok: false, code: 'QUEUE_ENTRY_INVALID' }
      entries = command.entryIds.map((id) => byId.get(id)!)
      break
    }
  }
  if (entries.length > QUEUE_CAPACITY) return { ok: false, code: 'QUEUE_FULL' }
  if (new Set(entries.map((entry) => entry.entryId.toLowerCase())).size !== entries.length) return { ok: false, code: 'QUEUE_ENTRY_INVALID' }
  let selection = selectedEntryId
  if (!entries.some((entry) => entry.entryId === selection && playable(entry))) {
    const oldPosition = current.findIndex((entry) => entry.entryId === selectedEntryId)
    const removing = ['remove', 'removeMany', 'removeFirst', 'removeUnavailable', 'clear'].includes(command.type)
    const remainingIds = new Set(entries.filter(playable).map((entry) => entry.entryId))
    const candidates = removing ? current : entries
    const available = (entry: QueueEntry) => remainingIds.has(entry.entryId)
    selection = candidates.slice(Math.max(0, oldPosition)).find(available)?.entryId ??
      candidates.slice(0, Math.max(0, oldPosition)).reverse().find(available)?.entryId ?? null
    if (!selectedEntryId && command.type !== 'replace') selection = null
  }
  return { ok: true, entries, selectedEntryId: selection }
}
