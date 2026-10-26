// features/tracks/components/TrackRow.tsx
'use client'

import { usePlayer } from '@/components/player/PlayerProvider'
import type { ITrack } from '@/types/track'
import { Card, Stack, Typography } from '@mui/material'
import Link from 'next/link'
import { useListenCount } from './ListenCountsProvider'
import { PlayButton } from './PlayButton'

interface TrackRowProps {
  track: ITrack
  queue?: ITrack[]
}

export function TrackRow({ track, queue }: TrackRowProps) {
  const { current } = usePlayer()
  const isCurrent = current?._id === track._id
  // Счётчик с оптимистичным оверрайдом: как только трек запускают в плеере,
  // listens растёт сразу, не дожидаясь обновления с сервера.
  const listens = useListenCount(track._id, track.listens)

  return (
    <Link href={`/tracks/${track._id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <Card
        component="div"
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          transition: 'background-color 120ms ease',

          // активный трек: подсветка не пропадает на hover
          ...(isCurrent
            ? {
                bgcolor: 'action.selected',
                '&:hover': { bgcolor: 'action.selected' },
              }
            : {
                '&:hover': { bgcolor: 'action.hover' },
              }),
        }}
      >
        <PlayButton track={track} queue={queue ?? [track]} />

        <Stack
          direction="row"
          sx={{
            flex: 1,
            minWidth: 0, // ← обязательно: иначе noWrap не сработает
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography noWrap sx={{ color: 'text.primary', minWidth: 0 }}>
            {track.name}
          </Typography>
          <Typography noWrap sx={{ color: 'text.secondary', flexShrink: 0 }}>
            {track.artist ?? '—'}
          </Typography>
        </Stack>

        <Typography
          sx={{
            color: 'text.secondary',
            fontSize: '0.85rem',
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {listens} listens
        </Typography>
      </Card>
    </Link>
  )
}
