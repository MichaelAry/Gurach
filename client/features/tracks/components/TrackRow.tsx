// features/tracks/components/TrackRow.tsx
'use client'
import { useLocale, useText } from '@/i18n/LocaleProvider'

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
  const lt = useText()
  const { locale } = useLocale()

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
        gap: { xs: 1, sm: 2 },
        flexWrap: { xs: 'wrap', sm: 'nowrap' },
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
      <Box sx={{ position: 'relative', zIndex: 1, display: 'inline-flex', order: 0, flexShrink: 0 }}>
        <PlayButton track={track} />
      </Box>
      {selectionEnabled && <Checkbox sx={{ position: 'relative', zIndex: 1, order: 1, flexShrink: 0 }} size="small" checked={selected} disabled={!track.audio} onChange={(event) => onSelectionChange?.(event.target.checked)} slotProps={{ input: { 'aria-label': lt('select335', { p0: track.name }) } }} />}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{
          order: { xs: 2, sm: 0 },
          flex: 1,
          flexBasis: { xs: '100%', sm: 'auto' },
          minWidth: 0, // ← обязательно: иначе noWrap не сработает
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: { xs: 0, sm: 2 },
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
        <Typography noWrap sx={{ color: 'text.secondary', minWidth: 0, flexShrink: { xs: 1, sm: 0 } }}>
          {track.artist ?? '—'}
        </Typography>
      </Stack>

      <Typography
        sx={{
          color: 'text.secondary',
          fontSize: '0.85rem',
          flexShrink: 0,
          order: { xs: 3, sm: 0 },
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatListens(listens, locale)}
      </Typography>
      <Box sx={{ position: 'relative', zIndex: 1, display: 'inline-flex', order: { xs: 4, sm: 0 }, flexShrink: 0 }}>
        <FavoriteButton trackId={track._id} name={track.name} />
      </Box>
      <Box sx={{ position: 'relative', zIndex: 1, display: 'inline-flex', order: { xs: 5, sm: 0 }, flexShrink: 0 }}>
        <QueueTrackActions track={track} />
      </Box>
    </Card>
  )
}
