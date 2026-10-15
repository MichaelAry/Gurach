// features/tracks/components/TrackRow.tsx
'use client'

import { usePlayer } from '@/components/player/PlayerProvider'
import type { ITrack } from '@/types/track'
import { Card, Stack, Typography } from '@mui/material'
import Link from 'next/link'
import { PlayButton } from './PlayButton'

interface TrackRowProps {
  track: ITrack
  queue?: ITrack[]
}

export function TrackRow({ track, queue }: TrackRowProps) {
  const { current } = usePlayer()
  const isCurrent = current?._id === track._id

  return (
    <Link href={`/tracks/${track._id}`} style={{ textDecoration: 'none' }}>
      <Card
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          // подсветка трека, который играет прямо сейчас
          ...(isCurrent && { bgcolor: 'action.selected' }),
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <PlayButton track={track} queue={queue ?? [track]} />

        <Stack direction="row" sx={{ flex: 1, justifyContent: 'space-between' }}>
          <Typography sx={{ color: 'text.primary' }}>{track.name}</Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            {track.artist ?? '—'}
          </Typography>
        </Stack>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
          {track.listens} listens
        </Typography>
      </Card>
    </Link>
  )
}
