import { expect, it } from 'vitest'
import { ListenProgress } from './listenProgress'

it('counts actual playback intervals and excludes pauses and seeks', () => {
  const progress = new ListenProgress()
  progress.sample(0, 0)
  progress.sample(10, 10_000)
  progress.suspend()
  progress.sample(100, 100_000)
  progress.sample(110, 110_000)
  expect(progress.seconds).toBe(20)
  expect(progress.qualifies(180)).toBe(false)
  progress.sample(120, 120_000)
  expect(progress.qualifies(180)).toBe(true)
})

it('caps a position jump by elapsed playback and handles playback speed', () => {
  const progress = new ListenProgress()
  progress.sample(0, 0)
  progress.sample(100, 1000)
  expect(progress.seconds).toBe(1)
  progress.sample(104, 3000, 2)
  expect(progress.seconds).toBe(5)
  progress.sample(0, 4000)
  expect(progress.seconds).toBe(5)
})

it('requires half a short track and thirty seconds otherwise', () => {
  const progress = new ListenProgress()
  progress.sample(0, 0)
  progress.sample(10, 10_000)
  expect(progress.qualifies(20)).toBe(true)
  expect(progress.qualifies(30)).toBe(false)
  expect(progress.qualifies(Number.NaN)).toBe(false)
})
