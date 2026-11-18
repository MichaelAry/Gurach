'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Box, Button, IconButton, Typography } from '@mui/material'
import { ThemeProvider, useTheme } from '@mui/material/styles'
import { useArtworkPalette } from './useArtworkPalette'
import { fullscreenArtworkTheme } from './fullscreenArtworkTheme'
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded'
import QueueMusicRounded from '@mui/icons-material/QueueMusicRounded'
import { useText } from '@/i18n/LocaleProvider'
import { useViewer } from '@/features/auth/ViewerProvider'
import { DownloadTrackButton } from '@/features/tracks/components/DownloadTrackButton'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { useQueue } from '@/features/queue/hooks'
import { QueuePanel } from '@/features/queue/components/QueuePanel'
import { usePlayerTransport } from './PlayerProvider'
import { playerReturnPath } from './returnPath'
import { ArtworkWear } from './ArtworkWear'
import { PlayerArtwork } from './PlayerArtwork'
import { WaveformProgress } from './WaveformProgress'
import './fullscreen-player.css'
import { PlaybackControls, PlayerFeedback, VolumeControl } from '@/components/player/PlayerControls'

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
  const { current, selectedEntryId, playing, position, count, oneOff, shuffle, repeat } = usePlayerTransport()
  const [queueOpen, setQueueOpen] = useState(false)
  const palette = useArtworkPalette(current?.picture)
  const theme = useTheme()
  const artworkTheme = useMemo(() => palette && fullscreenArtworkTheme(theme, palette), [theme, palette])
  const loading = !viewer.resolved || queue.status === 'loading'
  const entries = queue.canonical.entries
  const index = entries.findIndex(entry => entry.entryId === selectedEntryId)
  const upcoming = index >= 0 ? [...entries.slice(index + 1), ...(repeat === 'all' ? entries.slice(0, index + 1) : [])] : []
  // Shuffle has its own traversal order: never advertise a different next track.
  const upNext = current && (repeat === 'one' || (oneOff && repeat === 'all')) ? current
    : oneOff || shuffle || !current ? null
      : upcoming.find(entry => entry.availability === 'playable' && entry.track?.audio)?.track

  return <ThemeProvider theme={artworkTheme?.theme ?? theme}>
  <Box className="fullscreen-player" data-playing={playing} data-artwork-theme={artworkTheme ? 'cover' : 'default'}
    data-artwork-tone={artworkTheme?.tone ?? 'light'} style={artworkTheme?.style} sx={{ color: 'text.primary' }}>
    <div className="fullscreen-player-ambient" aria-hidden="true"><div className="fullscreen-player-glow" /></div>
    <header className="fullscreen-player-header">
      <Suspense fallback={<Box sx={{ width: 44, height: 44 }} />}><CollapsePlayer /></Suspense>
      <div className="fullscreen-player-brand">
        <Typography component="h1" sx={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-.04em' }}>{'Gurach'}</Typography>
        <Typography variant="caption" color="text.secondary">{lt('musicPlayer')}</Typography>
      </div>
      <IconButton onClick={() => setQueueOpen(true)} aria-label={lt('openQueueOf', { p0: count })} sx={{ minWidth: 44, minHeight: 44 }}>
        <QueueMusicRounded />
      </IconButton>
    </header>

    <div className="fullscreen-player-content">
      <div className="fullscreen-player-hero">
        <ArtworkWear trackId={current?._id}
          record={<PlayerArtwork picture={current?.picture} name="" />}
          artwork={<PlayerArtwork picture={current?.picture} name={current?.name ?? lt('musicPlayer')} />} />

        <div className="fullscreen-player-details">
          <div>
            <Typography variant="caption" component="p" className="fullscreen-player-eyebrow" sx={{ mb: 1.5 }}>
              {lt('nowPlaying')}{current && <> · {oneOff ? lt('oneTimePlayback') : `${position} / ${count}`}</>}
            </Typography>
            <div className="fullscreen-player-track">
              <div className="fullscreen-player-trackInfo">
                <Typography component="h2" sx={{ fontWeight: 500, fontSize: { xs: 'clamp(2rem, 8vw, 2.75rem)', md: 'clamp(3rem, 4.5vw, 4.5rem)' }, lineHeight: 1.02, letterSpacing: '-.05em', overflowWrap: 'anywhere' }}>
                  {current?.name ?? lt(loading ? 'loadingQueue' : 'chooseATrack')}
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 2, fontSize: { xs: '1rem', md: '1.125rem' }, overflowWrap: 'anywhere' }}>{current?.artist ?? lt('readyToPlay')}</Typography>
              </div>
              {current && (
                <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <DownloadTrackButton track={current} />
                  <FavoriteButton trackId={current._id} name={current.name} />
                </Box>
              )}
            </div>
          </div>
          <div className="fullscreen-player-transport"><PlaybackControls large /></div>
          {!current && !loading && <Button component={Link} href="/tracks" sx={{ alignSelf: 'flex-start' }}>{lt('openTrackCatalogue')}</Button>}
        </div>
      </div>

      <WaveformProgress />
      <div className="fullscreen-player-footer">
        <div className="fullscreen-player-upNext">
          {upNext && <div className="fullscreen-player-miniCover" aria-hidden="true"><PlayerArtwork picture={upNext.picture} name="" size={40} loading="lazy" /></div>}
          <div className="fullscreen-player-upNextText">
            <Typography variant="caption" color="text.secondary">{lt('upNext')}</Typography>
            <Typography variant="body2" title={upNext?.name} noWrap>
              {upNext?.name ?? lt(!current ? 'chooseATrack' : oneOff ? 'oneTimePlayback' : shuffle ? 'randomNextTrack' : 'queueEnd')}
            </Typography>
          </div>
        </div>
        <div className="fullscreen-player-footerActions">
          <div className="fullscreen-player-volume"><VolumeControl /></div>
          <Button startIcon={<QueueMusicRounded />} aria-label={lt('openQueueOf', { p0: count })} onClick={() => setQueueOpen(true)} sx={{ whiteSpace: 'nowrap' }}>
            {lt('queue')} {count}/100
          </Button>
        </div>
      </div>
      <div className="fullscreen-player-feedback">
        {loading && <Typography role="status" variant="body2" color="text.secondary">{lt('loadingQueue')}</Typography>}
        <PlayerFeedback />
      </div>
    </div>
    <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
  </Box>
  </ThemeProvider>
}
