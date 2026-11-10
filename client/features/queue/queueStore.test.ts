import { expect, it, vi } from 'vitest'
import { QueueStore, QueueTransportError } from './queueStore'
import { createOccurrence } from './commands'
import type { QueueEntry, QueueSnapshot } from './types'
const occurrence = (): QueueEntry => createOccurrence({ _id: 'a'.repeat(24), name: 'Track', artist: null, audio: '/audio.mp3', picture: null, listens: 0, duration: 1 })
const snapshot = (revision = 0, entries: QueueEntry[] = []): QueueSnapshot => ({ revision, capacity: 100, entries, updatedAt: null })
it('commits membership only after save and blocks concurrent edits', async () => {
  const added = occurrence()
  let complete!: (value: QueueSnapshot) => void
  const save = vi.fn(() => new Promise<QueueSnapshot>((resolve) => { complete = resolve }))
  const store = new QueueStore({ load: async () => snapshot(), save })
  await store.start()
  const pending = store.dispatch({ type: 'append', entries: [added] })
  expect(store.getSnapshot().canonical.entries).toEqual([])
  expect(store.getSnapshot().preview).toEqual([added])
  expect(await store.dispatch({ type: 'clear' })).toBe(false)
  complete(snapshot(1, [added]))
  expect(await pending).toBe(true)
  expect(store.getSnapshot().canonical.entries).toEqual([added])
  store.dispose()
})
it('retries an uncertain save with the same mutation ID and occurrence IDs', async () => {
  const added = occurrence()
  const save = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(snapshot(1, [added]))
  const store = new QueueStore({ load: async () => snapshot(), save }, () => 'same-mutation')
  await store.start()
  expect(await store.dispatch({ type: 'append', entries: [added] })).toBe(false)
  expect(await store.retry()).toBe(true)
  expect(save.mock.calls[0].slice(0, 3)).toEqual(save.mock.calls[1].slice(0, 3))
  store.dispose()
})
it('refetches on conflict and ignores completions after identity disposal', async () => {
  const load = vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot(3))
  const store = new QueueStore({ load, save: async () => { throw new QueueTransportError(409, 'conflict') } })
  await store.start()
  await store.dispatch({ type: 'append', entries: [occurrence()] })
  expect(store.getSnapshot()).toMatchObject({ status: 'conflict', canonical: { revision: 3 }, preview: null })
  expect(await store.dispatch({ type: 'clear' })).toBe(false)
  store.dispose()
  let complete!: (value: QueueSnapshot) => void
  const disposed = new QueueStore({ load: () => new Promise((resolve) => { complete = resolve }), save: async () => snapshot() })
  const starting = disposed.start()
  disposed.dispose()
  complete(snapshot(10, [occurrence()]))
  await starting
  expect(disposed.getSnapshot().canonical.revision).toBe(0)
})

it('clears a selection when refresh reports the same occurrence unavailable', async () => {
  const playable = occurrence()
  let snapshotValue = snapshot(1, [playable])
  const store = new QueueStore({ load: async () => snapshotValue, save: async () => snapshotValue })
  await store.start()
  expect(store.select(playable.entryId)).toBe(true)
  snapshotValue = snapshot(2, [{ ...playable, track: null, availability: 'unavailable', reason: 'deleted' }])
  await store.refresh()
  expect(store.getSnapshot()).toMatchObject({ selectedEntryId: null, canonical: { revision: 2 } })
  store.dispose()
})
