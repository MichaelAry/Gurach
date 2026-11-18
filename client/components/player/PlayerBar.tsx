'use client'
import { useText } from '@/i18n/LocaleProvider'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { useEffect, useRef, useState } from 'react'

import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded'
import { useRouter } from 'next/navigation'
import VolumeOffRounded from '@mui/icons-material/VolumeOffRounded'
import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded'
import QueueMusicRounded from '@mui/icons-material/QueueMusicRounded'
import { PlayerArtwork } from '@/features/player/PlayerArtwork'
import { Box, ButtonBase, Popover, IconButton, Stack, Typography } from '@mui/material'
import { QueuePanel } from '@/features/queue/components/QueuePanel'
import { usePlayerTransport } from './PlayerProvider'
import { PlaybackControls, PlaybackProgress, PlayerFeedback, VolumeControl } from './PlayerControls'

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
  const { current, position, count, oneOff, muted, volume } = usePlayerTransport()
  const [volumeAnchor, setVolumeAnchor] = useState<HTMLElement | null>(null)
  const openFullscreen = () => router.push(`/player?returnTo=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`)

  return <>
   <Box component="footer" ref={footerRef} sx={{ position: 'fixed', left: '50%', width: '100vw', transform: 'translateX(-50%)', bottom: 0, zIndex: 1100, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', pt: 1, pb: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
    <Box sx={{
     display: 'grid',
     gridTemplateAreas: { xs: '"track actions" "transport transport"', md: '"track transport actions"' },
     gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', md: 'minmax(0, 1fr) min(39%, 420px) minmax(0, 1fr)' },
     gap: { xs: .5, md: 3 },
     alignItems: 'center',
     px: 'max(16px, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))',
    }}>
     <Stack direction="row" spacing={1} sx={{ gridArea: 'track', justifySelf: 'start', alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
      <ButtonBase aria-label={lt('openPlayerFromArtwork')} onClick={openFullscreen} sx={{
       width: { xs: 56, md: 64 },
       height: { xs: 56, md: 64 },
       flexShrink: 0,
       borderRadius: 'var(--wae-radius-artwork)',
       overflow: 'hidden',
       '&:hover .fullscreen-player-artwork': { filter: 'brightness(1.1)' },
       '&.Mui-focusVisible': { outline: '2px solid var(--wae-accentText)', outlineOffset: 2 },
      }}>
       <PlayerArtwork picture={current?.picture} name="" size={48} loading="eager" />
      </ButtonBase>
      <Box sx={{ minWidth: 0 }}>
       <Typography title={current?.name} noWrap sx={{ fontSize: 15, fontWeight: 600, color: current ? 'var(--wae-accentText)' : 'text.primary' }}>{current?.name ?? lt('chooseATrack')}</Typography>
       <Stack direction="row" spacing={0.5} sx={{ fontSize: 12, color: 'text.secondary' }}>
        <Typography title={current?.artist ?? undefined} noWrap sx={{ fontSize: 'inherit', minWidth: 0 }}>{current?.artist ?? lt('readyToPlay')}</Typography>
        {current && count > 0 && (
         <Typography noWrap sx={{ fontSize: 'inherit', flexShrink: 0, maxWidth: '100%' }}>
          <Box component="span" aria-hidden sx={{ mr: 0.5 }}>·</Box>
          <span>{oneOff ? lt('oneTimePlayback') : `${position} / ${count}`}</span>
         </Typography>
        )}
       </Stack>
      </Box>
      {current && <FavoriteButton trackId={current._id} name={current.name} />}
     </Stack>
     <Box sx={{ gridArea: 'transport', minWidth: 0 }}>
      <PlaybackControls />
      <PlaybackProgress />
     </Box>
     <Box sx={{ gridArea: 'actions', justifySelf: 'end', width: { md: '100%' }, maxWidth: 240, minWidth: 0 }}>
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
       <IconButton aria-label={lt('openQueueOf', { p0: count })} onClick={() => setQueueOpen(true)}><QueueMusicRounded /></IconButton>
       <IconButton aria-label={lt('openFullscreenPlayer')} onClick={openFullscreen}><OpenInFullRounded /></IconButton>
       <IconButton aria-label={lt('openVolumeControl')} aria-expanded={Boolean(volumeAnchor)} aria-controls={volumeAnchor ? 'player-volume' : undefined} onClick={event => setVolumeAnchor(event.currentTarget)} sx={{ display: { md: 'none' } }}>{muted || volume === 0 ? <VolumeOffRounded /> : <VolumeUpRounded />}</IconButton>
      </Stack>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}><VolumeControl /></Box>
     </Box>
    </Box>
    <PlayerFeedback />
   </Box>
   <Popover open={Boolean(volumeAnchor)} anchorEl={volumeAnchor} onClose={() => setVolumeAnchor(null)} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
    <Box id="player-volume" sx={{ width: 280, p: 2 }}><Typography variant="subtitle2">{lt('volume')}</Typography><VolumeControl /></Box>
   </Popover>
   <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
  </>
}
