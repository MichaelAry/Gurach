'use client'
import { useText } from '@/i18n/LocaleProvider'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { useEffect, useRef, useState } from 'react'

import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded'
import { useRouter } from 'next/navigation'
import TuneRounded from '@mui/icons-material/TuneRounded'
import QueueMusicRounded from '@mui/icons-material/QueueMusicRounded'
import { PlayerArtwork } from '@/features/player/PlayerArtwork'
import { Box, Popover, IconButton, Stack, Typography } from '@mui/material'
import { QueuePanel } from '@/features/queue/components/QueuePanel'
import { usePlayerTransport } from './PlayerProvider'
import { PlaybackModes, PlaybackControls, PlaybackProgress, PlayerFeedback, VolumeControl } from './PlayerControls'

/**
 * Плеер, приклеенный к низу экрана: обложка, название, кнопки
 * prev / play / pause / next и ползунок перемотки.
 * Бар есть всегда — пока ничего не выбрано, показывает подсказку.
 */
export function PlayerBar() {
  const lt = useText()
  const router = useRouter()

  const footerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const footer = footerRef.current
    if (!footer) return
    const updateHeight = () => document.documentElement.style.setProperty('--player-bar-height', `${footer.getBoundingClientRect().height}px`)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(footer)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--player-bar-height')
    }
  }, [])

  const [queueOpen, setQueueOpen] = useState(false)
  const { current, position, count, oneOff } = usePlayerTransport()
  const [settings, setSettings] = useState<HTMLElement | null>(null)
  return <>
   <Box component="footer" ref={footerRef} sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1100, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', px: { xs: 2, md: 4 }, pt: 1, pb: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
    <Box sx={{ maxWidth: 1160, mx: 'auto', display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, .7fr)' }, gap: { xs: .5, md: 3 }, alignItems: 'center' }}>
     <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Box sx={{ width: { xs: 40, md: 48 }, height: { xs: 40, md: 48 }, flexShrink: 0, borderRadius: 'var(--wae-radius-artwork)', overflow: 'hidden' }}><PlayerArtwork picture={current?.picture} name="" /></Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
       <Typography title={current?.name} noWrap sx={{ fontSize: 15, fontWeight: 600 }}>{current?.name ?? lt('chooseATrack')}</Typography>
       <Typography title={current?.artist ?? undefined} noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>{current?.artist ?? lt('readyToPlay')}{current && count > 0 && <> · <span>{oneOff ? lt('oneTimePlayback') : `${position} / ${count}`}</span></>}</Typography>
      </Box>
      <IconButton aria-label={lt('openFullscreenPlayer')} onClick={() => router.push(`/player?returnTo=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`)}><OpenInFullRounded /></IconButton>
      <IconButton aria-label={lt('playbackSettings')} aria-expanded={Boolean(settings)} aria-controls={settings ? 'playback-settings' : undefined} onClick={event => setSettings(event.currentTarget)} sx={{ display: { md: 'none' } }}><TuneRounded /></IconButton>
     </Stack>
     <Box sx={{ minWidth: 0 }}>
      <PlaybackControls compact actions={<IconButton aria-label={lt('openQueueOf', { p0: count })} onClick={() => setQueueOpen(true)}><QueueMusicRounded /></IconButton>}>
       {current && <FavoriteButton trackId={current._id} name={current.name} />}
      </PlaybackControls>
      <PlaybackProgress />
     </Box>
     <Box sx={{ display: { xs: 'none', md: 'block' }, minWidth: 0 }}><Stack direction="row" sx={{ justifyContent: 'center' }}><PlaybackModes /></Stack><VolumeControl /></Box>
    </Box>
    <PlayerFeedback />
   </Box>
   <Popover open={Boolean(settings)} anchorEl={settings} onClose={() => setSettings(null)} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
    <Box id="playback-settings" sx={{ width: 260, p: 2 }}><Typography variant="subtitle2">{lt('playbackSettings')}</Typography><Stack direction="row" sx={{ my: 1 }}><PlaybackModes /></Stack><VolumeControl /></Box>
   </Popover>
   <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
  </>
}
