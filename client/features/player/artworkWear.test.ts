import { expect, it } from 'vitest'
import { artworkWearLevel, artworkWearPattern, guestWearCount, updateGuestWear } from './artworkWear'

it('keeps each playback id accounted for after a guest resets the copy', () => {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
  } as Storage
  expect(guestWearCount(storage, 'track')).toBe(0)
  expect(updateGuestWear(storage, 'track', 'first')).toBe(true)
  expect(updateGuestWear(storage, 'track', 'first')).toBe(false)
  expect(guestWearCount(storage, 'track')).toBe(1)
  expect(guestWearCount(storage, 'another-track')).toBe(0)
  updateGuestWear(storage, 'track', null)
  expect(updateGuestWear(storage, 'track', 'first')).toBe(false)
  expect(guestWearCount(storage, 'track')).toBe(0)
  updateGuestWear(storage, 'track', 'second')
  expect(guestWearCount(storage, 'track')).toBe(1)
})

it('changes degree at the thresholds and reproduces a listener’s pattern for the same track', () => {
  expect([0, 1, 4, 5, 14, 15, 100].map(artworkWearLevel)).toEqual([0, 1, 1, 2, 2, 3, 3])
  const pattern = artworkWearPattern('listener', 'track')
  expect(artworkWearPattern('listener', 'track')).toEqual(pattern)
  expect(artworkWearPattern('other-listener', 'track')).not.toEqual(pattern)
  expect(artworkWearPattern('listener', 'other-track')).not.toEqual(pattern)
})
