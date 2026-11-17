'use client'

import { useState } from 'react'
import { Box } from '@mui/material'
import '@/components/media/artwork.css'

export function PlayerArtwork({ picture, name }: { picture?: string | null; name: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const hasImage = picture && picture !== failed
  return <div className="fullscreen-player-artwork" data-placeholder={!hasImage || undefined}>
    {hasImage ? <Box component="img" src={picture} alt={name} onError={() => setFailed(picture)} /> : <span aria-hidden="true">G</span>}
  </div>
}
