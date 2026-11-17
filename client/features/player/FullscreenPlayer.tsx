'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Box, Button, IconButton, Stack, Typography } from '@mui/material'
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded'
import MusicNoteRounded from '@mui/icons-material/MusicNoteRounded'
import QueueMusicRounded from '@mui/icons-material/QueueMusicRounded'
import { useText } from '@/i18n/LocaleProvider'
import { useViewer } from '@/features/auth/ViewerProvider'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { useQueue } from '@/features/queue/hooks'
import { QueuePanel } from '@/features/queue/components/QueuePanel'
import { usePlayerTransport } from './PlayerProvider'
import { playerReturnPath } from './returnPath'
import { PlaybackControls, PlaybackProgress, PlayerFeedback, VolumeControl } from '@/components/player/PlayerControls'

function CollapsePlayer() {
  const lt = useText()
  const searchParams = useSearchParams()
  return <IconButton component={Link} href={playerReturnPath(searchParams.get('returnTo'))} replace aria-label={lt('closeFullscreenPlayer')} title={lt('closeFullscreenPlayer')} sx={{ minWidth: 44, minHeight: 44 }}>
    <KeyboardArrowDownRounded />
  </IconButton>
}

export function FullscreenPlayer() {
  const lt = useText()
  const viewer = useViewer()
  const queue = useQueue()
  const { current, position, count, oneOff } = usePlayerTransport()
  const [queueOpen, setQueueOpen] = useState(false)
  const loading = !viewer.resolved || queue.status === 'loading'

  return <Box sx={{
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    pt: 'max(16px, env(safe-area-inset-top, 0px))',
    pb: 'max(24px, env(safe-area-inset-bottom, 0px))',
    pl: 'max(16px, env(safe-area-inset-left, 0px))',
    pr: 'max(16px, env(safe-area-inset-right, 0px))',
    '& .Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
  }}>
    <Stack component="header" direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, width: '100%', maxWidth: 1120, mx: 'auto' }}>
      <Suspense fallback={<Box sx={{ width: 44, height: 44 }} />}><CollapsePlayer /></Suspense>
      <Typography component="h1" variant="subtitle1" sx={{ textAlign: 'center' }}>{lt('musicPlayer')}</Typography>
      <IconButton onClick={() => setQueueOpen(true)} aria-label={lt('openQueueOf', { p0: count })} sx={{ minWidth: 44, minHeight: 44 }}>
        <QueueMusicRounded />
      </IconButton>
    </Stack>

    <Box sx={{
      flex: 1, display: 'grid', alignContent: 'center', alignItems: 'center', width: '100%', maxWidth: 1040, mx: 'auto',
      gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
      gap: { xs: 3, md: 7 }, py: { xs: 3, md: 6 },
    }}>
      <Box sx={{
        width: '100%', maxWidth: { xs: 'min(360px, 38dvh)', md: 480 }, aspectRatio: '1', mx: 'auto',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        borderRadius: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
      }}>
        {current?.picture
          ? <Box component="img" src={current.picture} alt={current.name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <MusicNoteRounded sx={{ fontSize: { xs: 80, md: 120 }, color: 'text.secondary' }} />}
      </Box>

      <Stack spacing={3} sx={{ width: '100%', maxWidth: 480, mx: 'auto', minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h2" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2.25rem' }, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
              {current?.name ?? lt(loading ? 'loadingQueue' : 'chooseATrack')}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{current?.artist ?? lt('readyToPlay')}</Typography>
            {current && <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontVariantNumeric: 'tabular-nums' }}>
              {oneOff ? lt('oneTimePlayback') : `${position} / ${count}`}
            </Typography>}
          </Box>
          {current && <FavoriteButton trackId={current._id} name={current.name} />}
        </Stack>

        <PlaybackProgress expanded />
        <PlaybackControls large />
        <Box sx={{ width: '100%', maxWidth: 240, mx: 'auto !important', alignSelf: 'center' }}><VolumeControl /></Box>
        <Button variant="outlined" startIcon={<QueueMusicRounded />} aria-label={lt('openQueueOf', { p0: count })} onClick={() => setQueueOpen(true)}>
          {lt('queue')} {count}/100
        </Button>
        {!current && !loading && <Button component={Link} href="/tracks">{lt('openTrackCatalogue')}</Button>}
        {loading && <Typography role="status" variant="body2" color="text.secondary">{lt('loadingQueue')}</Typography>}
        <PlayerFeedback />
      </Stack>
    </Box>
    <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
  </Box>
}
