'use client'

import { Box, Typography } from '@mui/material'
import { useLayoutEffect, useRef, useState } from 'react'
import { labelSx } from './constants'

type Props = {
  label: string
  eased: number
}

export const AnchorLabel = ({ label, eased }: Props) => {
  const firstRef = useRef<HTMLSpanElement>(null)
  const [firstW, setFirstW] = useState(8)

  useLayoutEffect(() => {
    const el = firstRef.current
    if (!el) return
    const measure = () => setFirstW(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    document.fonts?.ready.then(measure)
    return () => ro.disconnect()
  }, [label])

  return (
    <Box sx={{ position: 'relative', lineHeight: 1, pointerEvents: 'none', flexShrink: 0 }}>
      <Typography variant="caption" sx={{ ...labelSx, visibility: 'hidden', display: 'block' }}>
        {label}
      </Typography>

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
