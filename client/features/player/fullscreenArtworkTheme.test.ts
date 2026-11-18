import { createTheme, getContrastRatio } from '@mui/material/styles'
import { expect, test } from 'vitest'
import { type RGB } from './artworkPalette'
import { fullscreenArtworkTheme } from './fullscreenArtworkTheme'

test.each([
  { dark: false, boundary: 'rgb(214, 214, 214)' },
  { dark: true, boundary: 'rgb(41, 41, 41)' },
])('keeps text and controls readable at the gradient boundary when dark=$dark', ({ dark, boundary }) => {
  for (const accent of [[0, 0, 0], [255, 255, 255], [40, 86, 207], [255, 162, 62]] as const) {
    const { theme } = fullscreenArtworkTheme(createTheme(), {
      colors: [[132, 141, 155], [100, 120, 128], accent], accentCandidates: [accent], dark,
    })
    expect(getContrastRatio(theme.palette.text.primary, boundary)).toBeGreaterThanOrEqual(4.5)
    expect(getContrastRatio(theme.palette.text.secondary, boundary)).toBeGreaterThanOrEqual(4.5)
    expect(getContrastRatio(theme.palette.primary.main, boundary)).toBeGreaterThanOrEqual(4.5)
    expect(getContrastRatio(theme.palette.primary.contrastText, theme.palette.primary.main)).toBeGreaterThanOrEqual(4.5)
  }
})

test('picks a contrasting orange accent outside the three dominant colors', () => {
  const colors = [[24, 39, 66], [95, 101, 114], [120, 133, 147]] as const
  const orange: RGB = [233, 145, 60]
  const { theme } = fullscreenArtworkTheme(createTheme(), { colors, accentCandidates: [...colors, orange], dark: true })
  expect(theme.palette.primary.main).toBe('rgb(233, 145, 60)')
})
