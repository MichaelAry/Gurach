'use client'
import { useText } from '@/i18n/LocaleProvider'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { useEffect, useRef, useState } from 'react'

import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded'
import { useRouter } from 'next/navigation'
import { Box, Button, IconButton, Stack, Typography } from '@mui/material'
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
  const { current, position, count, oneOff } = usePlayerTransport()
  const hasTrack = Boolean(current?._id)
  const cover = current?.picture

  return <>
    <Box
      component="footer"
      ref={footerRef}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1300,
        bgcolor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
        px: 2,
        pt: 1,
        pb: 'calc(8px + env(safe-area-inset-bottom, 0px))',
        '& .Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Stack
        direction="row"
        sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' }, width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: { xs: 1, md: 2 } }}
      >
        <Stack direction="row" spacing={1.5} sx={{ flex: { xs: '1 1 100%', md: '1 1 0' }, minWidth: 0, alignItems: 'center' }}>
          {/* Обложка / заглушка */}
          <Box
            sx={{
              width: 48,
              height: 48,
              flexShrink: 0,
              borderRadius: 1,
              overflow: 'hidden',
              bgcolor: 'background.default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {cover ? (
              <Box component="img" src={cover} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Typography sx={{ fontSize: '1.2rem' }}>♪</Typography>
            )}
          </Box>

          {/* Название + позиция в очереди */}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography title={current?.name} noWrap sx={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {current?.name ?? lt('chooseATrack')}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Typography title={current?.artist ?? undefined} noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {current?.artist ?? lt('readyToPlay')}
              </Typography>
              {/* Позиция в очереди видна только когда очередь длиннее одного трека */}
              {hasTrack && count > 0 && (
                <Typography
                  sx={{
                    fontSize: '0.7rem',
                    color: 'text.secondary',
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {oneOff ? lt('oneTimePlayback') : `${position} / ${count}`}
                </Typography>
              )}
            </Stack>
          </Box>
          <IconButton aria-label={lt('openFullscreenPlayer')} title={lt('openFullscreenPlayer')}
            onClick={() => router.push(`/player?returnTo=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`)}
            sx={{ minWidth: 44, minHeight: 44 }}>
            <OpenInFullRounded />
          </IconButton>
        </Stack>

        <Stack spacing={0.5} sx={{ order: { xs: 3, md: 0 }, width: { xs: '100%', md: '46%' }, maxWidth: { md: 560 }, flexShrink: 0, alignItems: 'center' }}>
          <PlaybackControls>
            {current && <FavoriteButton trackId={current._id} name={current.name} />}
          </PlaybackControls>
          <PlaybackProgress />
        </Stack>

        <Box sx={{ order: { xs: 4, md: 0 }, flex: { xs: '1 1 100%', md: '1 1 0' }, minWidth: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1 }}>
          <Stack spacing={0.5} sx={{ width: 140, maxWidth: '100%', minWidth: 0, alignItems: 'center' }}>
            <VolumeControl />
            <Button size="small" sx={{ minWidth: 0, whiteSpace: 'nowrap' }} aria-label={lt('openQueueOf', { p0: count })} onClick={() => setQueueOpen(true)}>{lt('queue')}{count}/100</Button>
          </Stack>
        </Box>
      </Stack>
      <PlayerFeedback />
    </Box>
    <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
  </>
}
