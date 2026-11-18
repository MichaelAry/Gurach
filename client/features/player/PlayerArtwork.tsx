'use client'

import { useState } from 'react'
import { Box } from '@mui/material'
import '@/components/media/artwork.css'
import { artworkSource } from './artworkSource'

export function PlayerArtwork({ picture, name, size, loading = 'eager' }: {
  picture?: string | null
  name: string
  size?: 40 | 44 | 48
  loading?: 'lazy' | 'eager'
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const hasImage = picture && picture !== failed
  return <div className="fullscreen-player-artwork" data-placeholder={!hasImage || undefined}>
    {hasImage ? <Box component="img" src={size ? artworkSource(picture, 48) : picture}
      srcSet={size ? `${artworkSource(picture, 48)} 1x, ${artworkSource(picture, 96)} 2x, ${artworkSource(picture, 144)} 3x` : undefined}
      width={size ?? 640} height={size ?? 640} loading={loading} decoding="async"
      alt={name} onError={() => setFailed(picture)} /> : <span aria-hidden="true">G</span>}
  </div>
}
