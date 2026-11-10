import { describe, expect, it } from 'vitest'
import { createTrackQueueSnapshot } from './trackQueue'

const tracks = Array.from({ length: 140 }, (_, index) => ({
  _id: `track-${index + 1}`,
}))

describe('createTrackQueueSnapshot', () => {
  it('starts at the selected track and includes it', () => {
    const queue = createTrackQueueSnapshot(tracks, 20)
    expect(queue).toHaveLength(100)
    expect(queue.map((track) => track._id)).toEqual(
      tracks.slice(20, 120).map((track) => track._id),
    )
  })

  it('caps long queues at 100 and keeps the late selection', () => {
    const queue = createTrackQueueSnapshot(tracks, 139)
    expect(queue).toEqual([{ _id: 'track-140' }])
    expect(queue).toHaveLength(1)
  })

  it('returns an empty snapshot when the selected ID is absent', () => {
    expect(createTrackQueueSnapshot(tracks, -1)).toEqual([])
  })
})
