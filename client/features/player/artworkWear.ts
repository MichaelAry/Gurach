const prefix = 'gurach:guest-artwork-wear:'
export const guestWearChanged = 'gurach:guest-artwork-wear-changed'

export function guestWearIdentity(storage: Storage) {
  const key = 'gurach:guest-artwork-wear-identity'
  const existing = storage.getItem(key)
  if (existing) return existing
  const identity = crypto.randomUUID()
  storage.setItem(key, identity)
  return identity
}

interface GuestWear {
  seen: string[]
  count: number
}

function readGuestWear(storage: Storage, trackId: string): GuestWear {
  const raw = storage.getItem(prefix + trackId)
  if (!raw) return { seen: [], count: 0 }
  const data = JSON.parse(raw) as Partial<GuestWear> | null
  if (!data || !Array.isArray(data.seen) || !data.seen.every(id => typeof id === 'string') ||
      typeof data.count !== 'number' || !Number.isSafeInteger(data.count) || data.count < 0 || data.count > data.seen.length) {
    throw new Error('Invalid artwork wear data')
  }
  return { seen: data.seen, count: data.count }
}

export function guestWearCount(storage: Storage, trackId: string) {
  return readGuestWear(storage, trackId).count
}

export function updateGuestWear(storage: Storage, trackId: string, playbackId: string | null) {
  const data = readGuestWear(storage, trackId)
  if (playbackId && data.seen.includes(playbackId)) return false
  const next = playbackId ? { seen: [...data.seen, playbackId], count: data.count + 1 } : { ...data, count: 0 }
  storage.setItem(prefix + trackId, JSON.stringify(next))
  return true
}

export async function saveGuestWear(trackId: string, playbackId: string | null, isGuest: () => boolean) {
  const save = () => {
    if (isGuest() && updateGuestWear(window.localStorage, trackId, playbackId)) {
      window.dispatchEvent(new Event(guestWearChanged))
    }
  }
  if (navigator.locks) await navigator.locks.request(prefix + trackId, save)
  else save()
}

export function artworkWearLevel(count: number) {
  if (count >= 15) return 3
  if (count >= 5) return 2
  return count > 0 ? 1 : 0
}

export function artworkWearPattern(identity: string, trackId: string) {
  let seed = 2166136261
  for (const character of `${identity}:${trackId}`) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619)
  }
  const unsigned = seed >>> 0
  return {
    '--wear-angle': `${35 + unsigned % 100}deg`,
    '--wear-x': `${44 + (unsigned >>> 8) % 15}%`,
    '--wear-y': `${43 + (unsigned >>> 16) % 15}%`,
    '--wear-fold': `${14 + (unsigned >>> 24) % 24}%`,
  }
}
