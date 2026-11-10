import { expect, it } from 'vitest'
import { validateGuestQueue } from './guestAdapter'
import type { QueueEntry } from './types'

const entry = (id: number): QueueEntry => ({
  entryId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  trackId: 'a'.repeat(24), display: { name: 'Track', artist: null }, track: null,
  availability: 'unavailable', reason: 'deleted',
  source: 'manual',
})
const payload = (entries: QueueEntry[], version = 1) => JSON.stringify({ version, snapshot: { revision: 2, capacity: 100, entries, updatedAt: null } })

it('accepts bounded versioned guest snapshots and preserves duplicate track occurrences', () => {
  const snapshot = validateGuestQueue(payload([entry(1), entry(2)]))
  expect(snapshot?.entries.map((item) => item.trackId)).toEqual(['a'.repeat(24), 'a'.repeat(24)])
})

it('rejects malformed, unknown-version, duplicate-entry and over-capacity data', () => {
  expect(validateGuestQueue('{')).toBeNull()
  expect(validateGuestQueue(payload([entry(1)], 2))).toBeNull()
  expect(validateGuestQueue(payload([entry(1), entry(1)]))).toBeNull()
  expect(validateGuestQueue(payload(Array.from({ length: 101 }, (_, index) => entry(index + 1))))).toBeNull()
})
