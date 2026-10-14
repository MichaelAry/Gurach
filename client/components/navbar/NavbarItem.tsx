'use client'

import Link from 'next/link'

import { AnchorLabel } from '@/components/navbar/AnchorLabel'
import { Box } from '@mui/material'
import { FADE_REACH, FULL_REACH } from './constants'
import type { TrackItem } from './types'
import { rand } from './utils'

type Props = {
  item: TrackItem
  idx: number
  hoveredIdx: number | null
  onEnter: (idx: number) => void
  onLeave: () => void
}

export const NavbarItem = ({ item, idx, hoveredIdx, onEnter, onLeave }: Props) => {
  const seed = rand(item.id)
  const jitterX = 0.8 + rand(item.id, 1) * 0.4
  const jitterZ = 0.8 + rand(item.id, 2) * 0.4
  const jitterSX = 0.85 + rand(item.id, 3) * 0.3
  const jitterSY = 0.85 + rand(item.id, 4) * 0.3
  const jitterRX = 0.7 + rand(item.id, 5) * 0.6
  const jitterFalloff = 0.9 + rand(item.id, 6) * 0.2

  const baseWidth = item.isAnchor ? 52 : 8 + seed * 40
  const baseHeight = item.isAnchor ? 3 : 1 + Math.round(seed * 2)

  const dist = hoveredIdx === null ? Infinity : Math.abs(idx - hoveredIdx)
  const t = Math.min(1, Math.max(0, (FADE_REACH - dist) / (FADE_REACH - FULL_REACH)))
  const eased = t * t * (3 - 2 * t)

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
      onMouseEnter={() => onEnter(idx)}
      onMouseLeave={onLeave}
      component={item.isAnchor ? Link : 'div'}
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
      {item.isAnchor && <AnchorLabel label={item.label ?? ''} eased={eased} />}

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
}
