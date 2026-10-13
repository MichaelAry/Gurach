'use client'

import { Box, Typography } from '@mui/material'
import { useLayoutEffect, useRef, useState } from 'react'

type TrackItem = {
  id: number
  isAnchor: boolean
  label: string
  href?: string
}

// deterministic pseudo-random -> stable spectrogram pattern across renders
const rand = (i: number, salt = 0) => {
  const n = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return n - Math.floor(n)
}

// rows within FULL_REACH of the cursor show the whole label; the reveal then
// eases out smoothly until FADE_REACH, beyond which only the first letter shows
const FULL_REACH = 6
const FADE_REACH = 15

// shared text style for ghost + visible overlay so widths match exactly
const labelSx = {
  fontWeight: 700,
  fontSize: '0.7rem',
  letterSpacing: '1.5px',
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap' as const,
  color: '#000',
}

// Label that slides out leftward. The full label width and the width of its
// first letter are both measured from hidden copies, so when collapsed exactly
// the first letter is visible (not a pixel of the second), and when expanded
// the window is exactly the text length.
const AnchorLabel = ({ label, eased }: { label: string; eased: number }) => {
  const firstRef = useRef<HTMLSpanElement>(null)
  const [firstW, setFirstW] = useState(8)

  useLayoutEffect(() => {
    const el = firstRef.current
    if (!el) return
    const measure = () => setFirstW(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // re-measure once web fonts are ready (glyph widths may change)
    document.fonts?.ready.then(measure)
    return () => ro.disconnect()
  }, [label])

  return (
    <Box
      sx={{
        position: 'relative',
        lineHeight: 1,
        pointerEvents: 'none',
        flexShrink: 0,
      }}
    >
      {/* Ghost of the full label: only sizes the container */}
      <Typography variant="caption" sx={{ ...labelSx, visibility: 'hidden', display: 'block' }}>
        {label}
      </Typography>

      {/* Ghost of the first letter (incl. its letter-spacing): measured */}
      <Typography
        ref={firstRef}
        component="span"
        variant="caption"
        sx={{
          ...labelSx,
          position: 'absolute',
          top: 0,
          left: 0,
          visibility: 'hidden',
          display: 'inline-block',
        }}
      >
        {label.charAt(0)}
      </Typography>

      {/* Reveal window: right-anchored, grows leftward from the first
          letter's width up to the full label width */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: `calc(${firstW}px + ${eased} * (100% - ${firstW}px))`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          overflow: 'hidden',
          transition: 'width 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <Typography variant="caption" sx={{ ...labelSx, display: 'block' }}>
          {label}
        </Typography>
      </Box>
    </Box>
  )
}

export const Navbar = () => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const trackStructure: TrackItem[] = [
    { id: 1, isAnchor: true, label: 'Main', href: '#main' },
    ...Array.from({ length: 14 }, (_, i) => ({ id: 2 + i, isAnchor: false, label: '' })),
    { id: 20, isAnchor: true, label: 'All tracks', href: '#all-tracks' },
    ...Array.from({ length: 20 }, (_, i) => ({ id: 21 + i, isAnchor: false, label: '' })),
  ]

  return (
    <Box
      sx={{
        position: 'fixed',
        right: 50,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        alignItems: 'flex-end',
        p: 1,
        perspective: '800px',
        transformStyle: 'preserve-3d',
        userSelect: 'none',
      }}
    >
      {trackStructure.map((item, idx) => {
        const seed = rand(item.id)
        const jitterX = 0.8 + rand(item.id, 1) * 0.4
        const jitterZ = 0.8 + rand(item.id, 2) * 0.4
        const jitterSX = 0.85 + rand(item.id, 3) * 0.3
        const jitterSY = 0.85 + rand(item.id, 4) * 0.3
        const jitterRX = 0.7 + rand(item.id, 5) * 0.6
        const jitterFalloff = 0.9 + rand(item.id, 6) * 0.2

        const baseWidth = item.isAnchor ? 52 : 8 + seed * 40
        const baseHeight = item.isAnchor ? 3 : 1 + Math.round(seed * 2)

        // full reveal inside FULL_REACH rows, smooth fall-off up to FADE_REACH
        const dist = hoveredIdx === null ? Infinity : Math.abs(idx - hoveredIdx)
        const t = Math.min(1, Math.max(0, (FADE_REACH - dist) / (FADE_REACH - FULL_REACH)))
        const eased = t * t * (3 - 2 * t) // smoothstep

        // 3D bulge — restrained
        let translateX = 0
        let translateZ = 0
        let scaleX = 1
        let scaleY = 1
        let rotateX = 0

        if (hoveredIdx !== null) {
          const distance = Math.abs(idx - hoveredIdx)
          if (distance <= 8) {
            const power = (8 - distance) / 8
            const bulge = Math.pow(power, 2 * jitterFalloff)
            translateX = -bulge * 8 * jitterX
            translateZ = bulge * 24 * jitterZ
            scaleX = 1 + bulge * 0.35 * jitterSX
            scaleY = 1 + bulge * 0.4 * jitterSY
            rotateX = (idx - hoveredIdx) * -1.2 * jitterRX
          }
        }

        const veryNear = hoveredIdx !== null && Math.abs(idx - hoveredIdx) <= 1

        return (
          <Box
            key={item.id}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
            component={item.isAnchor ? 'a' : 'div'}
            href={item.isAnchor ? item.href : undefined}
            sx={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 1.5,
              textDecoration: 'none',
              cursor: item.isAnchor ? 'pointer' : 'default',
              height: '9px',
              transformOrigin: 'right center',
              transform: `
                translateX(${translateX}px)
                translateZ(${translateZ}px)
                scaleX(${scaleX})
                scaleY(${scaleY})
                rotateX(${rotateX}deg)
              `,
              transition: 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease',

              // oversized invisible sensor — cursor entering anywhere in this
              // rectangle counts as hovering this row
              '&::before': {
                content: '""',
                position: 'absolute',
                top: '50%',
                left: '-160px',
                right: '-20px',
                height: '26px',
                transform: 'translateY(-50%)',
                background: 'transparent',
                pointerEvents: 'auto',
              },
            }}
          >
            {item.isAnchor && <AnchorLabel label={item.label} eased={eased} />}

            <Box
              sx={{
                height: `${baseHeight}px`,
                width: `${baseWidth}px`,
                backgroundColor: '#000',
                opacity: veryNear ? 1 : 0.6 + eased * 0.3,
                borderRadius: '1px',
                boxShadow: veryNear ? '0 0 0 1px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'opacity 0.3s ease, box-shadow 0.3s ease',
                pointerEvents: 'none',
              }}
            />
          </Box>
        )
      })}
    </Box>
  )
}

export default Navbar
