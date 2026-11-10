import { expect, it } from 'vitest'
import { createOccurrence } from './commands'
import { queueReducer } from './queueReducer'
import type { QueueEntry } from './types'
export function entry(index: number): QueueEntry {
  return createOccurrence({ _id: 'a'.repeat(24), name: `Track ${index}`, artist: null, audio: '/audio.mp3', picture: null, listens: 0, duration: 1 },
    () => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)
}
it('rejects overflow atomically, allows distinct occurrences and refuses colliding IDs', () => {
  const current = Array.from({ length: 99 }, (_, index) => entry(index))
  const before = JSON.stringify(current)
  expect(queueReducer(current, null, { type: 'append', entries: [entry(100), entry(101)] })).toEqual({ ok: false, code: 'QUEUE_FULL' })
  const valid = queueReducer(current, null, { type: 'append', entries: [entry(100)] })
  expect(valid.ok && valid.entries.length).toBe(100)
  expect(queueReducer(current, null, { type: 'append', entries: [entry(0)] })).toEqual({ ok: false, code: 'QUEUE_ENTRY_INVALID' })
  expect(JSON.stringify(current)).toBe(before)
})
it('inserts next by occurrence and applies deterministic selection on removal/clear', () => {
  const current = [entry(1), entry(2), entry(3)]
  const next = queueReducer(current, current[0].entryId, { type: 'play-next', entries: [entry(4)] })
  expect(next.ok && next.entries.map((item) => item.display.name)).toEqual(['Track 1', 'Track 2', 'Track 3', 'Track 4'])
  const removed = queueReducer(current, current[1].entryId, { type: 'remove', entryId: current[1].entryId })
  expect(removed.ok && removed.selectedEntryId).toBe(current[2].entryId)
  const tail = queueReducer(current, current[2].entryId, { type: 'remove', entryId: current[2].entryId })
  expect(tail.ok && tail.selectedEntryId).toBe(current[1].entryId)
  expect(queueReducer(current, current[0].entryId, { type: 'clear' })).toMatchObject({ entries: [], selectedEntryId: null })
})
it('keeps manual additions in FIFO order ahead of the automatic remainder, preserving the active occurrence', () => {
  const automatic = [entry(1), entry(2), entry(3)].map((item) => ({ ...item, source: 'automatic' as const }))
  const first = queueReducer(automatic, automatic[0].entryId, { type: 'append', entries: [entry(4)] })
  expect(first).toMatchObject({ ok: true, entries: [automatic[0], entry(4), automatic[1], automatic[2]], selectedEntryId: automatic[0].entryId })
  if (!first.ok) throw new Error('First addition failed')
  const second = queueReducer(first.entries, first.selectedEntryId, { type: 'play-next', entries: [entry(5), entry(6)] })
  expect(second).toMatchObject({ entries: [automatic[0], entry(4), entry(5), entry(6), automatic[1], automatic[2]], selectedEntryId: automatic[0].entryId })
  if (!second.ok) throw new Error('Second addition failed')
  const duringManual = queueReducer(second.entries, entry(4).entryId, { type: 'append', entries: [entry(7)] })
  expect(duringManual).toMatchObject({ entries: [automatic[0], entry(4), entry(5), entry(6), entry(7), automatic[1], automatic[2]], selectedEntryId: entry(4).entryId })
  const beforePlayback = queueReducer(automatic, null, { type: 'append', entries: [entry(4)] })
  expect(beforePlayback).toMatchObject({ entries: [entry(4), ...automatic], selectedEntryId: null })
})
it('preserves invariants and input immutability over repeated append/reorder/remove commands', () => {
  let current: QueueEntry[] = []
  for (let index = 0; index < 250; index++) {
    const before = JSON.stringify(current)
    const result = queueReducer(current, null, index % 3 === 0 ? { type: 'reorder', entryIds: current.map((item) => item.entryId).reverse() } :
      index % 3 === 1 ? { type: 'append', entries: [entry(index)] } : { type: 'remove', entryId: current[0]?.entryId ?? '' })
    expect(JSON.stringify(current)).toBe(before)
    if (result.ok) current = result.entries
    expect(current.length).toBeLessThanOrEqual(100)
    expect(new Set(current.map((item) => item.entryId)).size).toBe(current.length)
  }
})
it('removes unavailable entries and rejects invalid replacement/reorder without partial edits', () => {
  const unavailable = { ...entry(2), track: null, availability: 'unavailable' as const, reason: 'deleted' as const }
  const current = [entry(1), unavailable, entry(3)]
  expect(queueReducer(current, unavailable.entryId, { type: 'removeUnavailable' })).toMatchObject({ ok: true, entries: [current[0], current[2]], selectedEntryId: current[2].entryId })
  expect(queueReducer(current, current[0].entryId, { type: 'reorder', entryIds: [current[0].entryId] })).toEqual({ ok: false, code: 'QUEUE_ENTRY_INVALID' })
  expect(queueReducer(current, null, { type: 'replace', entries: Array.from({ length: 101 }, (_, index) => entry(index)) })).toEqual({ ok: false, code: 'QUEUE_FULL' })
})
