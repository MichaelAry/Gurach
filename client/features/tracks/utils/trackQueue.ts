export const MAX_PLAYBACK_QUEUE_ENTRIES = 100

/** Snapshot the loaded catalogue from the chosen track, with a fixed ceiling. */
export function createTrackQueueSnapshot<T>(
  tracks: readonly T[],
  selectedIndex: number,
): T[] {
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= tracks.length) {
    return []
  }
  return tracks.slice(selectedIndex, selectedIndex + MAX_PLAYBACK_QUEUE_ENTRIES)
}
