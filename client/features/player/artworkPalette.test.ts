import { expect, test } from 'vitest'
import { artworkPalette } from './artworkPalette'

const pixels = (...groups: [number, number, number, number, number][]) =>
  new Uint8ClampedArray(groups.flatMap(([r, g, b, alpha, count]) => Array.from({ length: count }, () => [r, g, b, alpha]).flat()))

test('ranks coverage, merges nearby bins and ignores transparent pixels', () => {
  expect(artworkPalette(pixels([190, 40, 20, 255, 40], [205, 40, 20, 255, 20], [20, 180, 50, 255, 30], [20, 50, 180, 255, 10], [255, 255, 255, 0, 100]))?.colors)
    .toEqual([[195, 40, 20], [20, 180, 50], [20, 50, 180]])
})

test('orders ties consistently and handles transparent and monochrome artwork', () => {
  expect(artworkPalette(pixels([255, 255, 255, 0, 100]))).toBeNull()
  for (const tone of [0, 255]) {
    const palette = artworkPalette(pixels([tone, tone, tone, 255, 100]))!
    expect(palette.colors[0]).toEqual([tone, tone, tone])
    expect(new Set(palette.colors.map(String)).size).toBe(3)
  }
  expect(artworkPalette(pixels([255, 0, 0, 255, 1], [0, 0, 255, 255, 1]))?.colors[0]).toEqual([0, 0, 255])
})

test('synthesizes a distinct third tone for two-color artwork', () => {
  const palette = artworkPalette(pixels([0, 0, 0, 255, 2], [255, 255, 255, 255, 1]))
  expect(palette?.colors).toEqual([[0, 0, 0], [255, 255, 255], [128, 128, 128]])
})

test('uses average cover luminance and ignores tiny or transparent accent candidates', () => {
  const palette = artworkPalette(pixels(
    [24, 39, 66, 255, 70], [95, 101, 114, 255, 19], [219, 122, 49, 255, 10],
    [0, 255, 0, 255, 1], [255, 255, 255, 0, 90],
  ))
  expect(palette?.dark).toBe(true)
  expect(palette?.accentCandidates).toEqual([[24, 39, 66], [95, 101, 114], [219, 122, 49]])
  expect(artworkPalette(pixels([220, 223, 228, 255, 80], [30, 40, 55, 255, 20]))?.dark).toBe(false)
})
