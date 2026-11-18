import type { CSSProperties } from 'react'
import { createTheme, type Theme } from '@mui/material/styles'
import { black, luminance, mix, rgb, white, type ArtworkPalette, type RGB } from './artworkPalette'

function contrast(a: RGB, b: RGB) {
  const first = luminance(a) + .05
  const second = luminance(b) + .05
  return Math.max(first, second) / Math.min(first, second)
}

function readable(color: RGB, ink: RGB, background: RGB) {
  for (let step = 0; step < 20; step++) {
    const candidate = mix(color, ink, step / 20)
    if (contrast(candidate, background) >= 4.5) return candidate
  }
  return ink
}

function expressiveAccent(candidates: readonly RGB[], background: RGB, fallback: RGB) {
  let best = fallback
  let bestScore = 0
  for (const candidate of candidates) {
    const chroma = Math.max(...candidate) - Math.min(...candidate)
    const score = chroma * Math.min(4.5, contrast(candidate, background))
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

export function fullscreenArtworkTheme(theme: Theme, { colors: [main, glow, edge], accentCandidates, dark }: ArtworkPalette) {
  const tone = dark ? 'dark' : 'light'
  const neutral = dark ? black : white
  const ink = dark ? white : black
  // Gradient stops and interactive surfaces stay within this channel bound,
  // including when two backgrounds of the same tone interpolate.
  const boundary = mix(neutral, ink, .16)
  const backgroundTint = (color: RGB, lightMix: number, darkMix: number) => {
    if (!dark) return mix(color, white, lightMix)
    // Keep the hue of dark covers while capping bright regions of mixed covers.
    const intensity = Math.min(1 - darkMix, 41 / Math.max(...color))
    return mix(black, color, intensity)
  }
  const base = backgroundTint(main, .92, .55)
  const accent = expressiveAccent(accentCandidates, base, main)
  const active = rgb(readable(accent, ink, boundary))
  const strong = rgb(readable(mix(accent, ink, .25), ink, boundary))
  const secondary = rgb(readable(mix(main, ink, .68), ink, boundary))
  const selected = rgb(mix(accent, neutral, .88))
  const surface = rgb(backgroundTint(main, .94, .65))
  const border = rgb(mix(main, ink, .26))
  const accents = {
    '--wae-accent': active,
    '--wae-accentText': strong,
    '--wae-activeSurface': selected,
    '--wae-textSecondaryStrong': secondary,
  }
  const style = {
    [`--artwork-${tone}-base`]: rgb(base),
    [`--artwork-${tone}-glow`]: rgb(backgroundTint(glow, .84, .62)),
    [`--artwork-${tone}-edge`]: rgb(backgroundTint(edge, .86, .7)),
    '--artwork-record': rgb(main),
    '--artwork-groove': rgb(mix(main, black, .25)),
    '--artwork-highlight': rgb(mix(main, white, .24)),
    '--player-accent': active,
    '--player-text-secondary': secondary,
    '--player-border': border,
    ...accents,
  } as CSSProperties

  return {
    tone,
    style,
    theme: createTheme(theme, {
      palette: {
        mode: tone,
        background: { default: rgb(base), paper: surface },
        text: { primary: rgb(ink), secondary, disabled: rgb(mix(neutral, ink, .42)) },
        primary: { main: active, light: active, dark: strong, contrastText: rgb(neutral) },
        action: {
          active: secondary, hover: selected, selected, disabledBackground: selected,
          disabled: rgb(mix(neutral, ink, .42)), focus: selected,
        },
        divider: border,
        ...(dark && {
          error: { main: '#f7a7a2', contrastText: '#241312' },
          warning: { main: '#efd08d', contrastText: '#281e10' },
          success: { main: '#b7d5ae', contrastText: '#19251a' },
          info: { main: '#aed2df', contrastText: '#132329' },
        }),
      },
      components: {
        MuiDrawer: { styleOverrides: { paper: { ...accents, borderColor: border, '& .MuiButtonBase-root': { transitionProperty: 'box-shadow, transform' } } } },
        MuiButtonBase: { styleOverrides: { root: { '&.Mui-focusVisible': { outline: `2px solid ${active}`, outlineOffset: 2 } } } },
        MuiSlider: { styleOverrides: { thumb: { '&.Mui-focusVisible': { outline: `2px solid ${active}`, outlineOffset: 3 } } } },
      },
    }),
  }
}
