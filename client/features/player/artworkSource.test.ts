import { expect, it } from 'vitest'
import { artworkSource } from './artworkSource'

it('requests cover thumbnails while preserving origin and other parameters', () => {
  expect(artworkSource('https://api.example.com/static/picture/cover.png', 96)).toBe('https://api.example.com/static/picture/cover.png?size=96')
  expect(artworkSource('/static/picture/cover.png?size=48&v=2#cover', 144)).toBe('/static/picture/cover.png?size=144&v=2#cover')
})

it('leaves other image sources intact', () => {
  for (const source of ['/cover.png', 'https://images.example.com/cover.png', 'data:image/png;base64,abc', 'blob:https://example.com/id', 'invalid']) {
    expect(artworkSource(source, 48)).toBe(source)
  }
})
