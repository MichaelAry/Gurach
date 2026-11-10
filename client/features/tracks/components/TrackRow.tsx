// features/tracks/components/TrackRow.tsx
'use client'

import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { usePlayerTransport } from '@/components/player/PlayerProvider'
import type { TrackListItem } from '../types'
import { Box, Card, Checkbox, Stack, Typography } from '@mui/material'
import Link from 'next/link'
import { useListenCount } from './ListenCountsProvider'
import { formatListens } from '../utils/formatListens'
import { PlayButton } from './PlayButton'
import { QueueTrackActions } from '@/features/queue/components/QueueTrackActions'

interface TrackRowProps {
  track: TrackListItem
  selectionEnabled?: boolean
  selected?: boolean
  onSelectionChange?: (selected: boolean) => void
}

export function TrackRow({ track, selectionEnabled = false, selected = false, onSelectionChange }: TrackRowProps) {
  const { current } = usePlayerTransport()
  const isCurrent = current?._id === track._id
  const listens = useListenCount(track._id, track.listens)

  return (
    <Card
      component="div"
      sx={{
        position: 'relative',
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
      <Box sx={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}>
        <PlayButton track={track} />
      </Box>
      {selectionEnabled && <Checkbox sx={{ position: 'relative', zIndex: 1 }} size="small" checked={selected} disabled={!track.audio} onChange={(event) => onSelectionChange?.(event.target.checked)} slotProps={{ input: { 'aria-label': `Выбрать ${track.name}` } }} />}

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
        <Typography
          component={Link}
          href={`/tracks/${track._id}`}
          noWrap
          sx={{
            color: 'text.primary',
            textDecoration: 'none',
            minWidth: 0,
            '&::after': { content: '""', position: 'absolute', inset: 0 },
            '&:focus-visible': {
              outline: 'none',
              '&::after': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
            },
          }}
        >
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
        {formatListens(listens)}
      </Typography>
      <Box sx={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}>
        <FavoriteButton trackId={track._id} name={track.name} />
      </Box>
      <Box sx={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}>
        <QueueTrackActions track={track} />
      </Box>
    </Card>
  )
}
