'use client'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { useEffect, useRef, useState } from 'react'

import PauseRounded from '@mui/icons-material/PauseRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import SkipNextRounded from '@mui/icons-material/SkipNextRounded'
import SkipPreviousRounded from '@mui/icons-material/SkipPreviousRounded'
import { Alert, Box, Button, IconButton, Slider, Stack, Typography } from '@mui/material'
import { useQueueStore } from '@/features/queue/hooks'
import { clearGuestQueue } from '@/features/queue/guestAdapter'
import { QueuePanel } from '@/features/queue/components/QueuePanel'
import { usePlayer } from './PlayerProvider'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Плеер, приклеенный к низу экрана: обложка, название, кнопки
 * prev / play / pause / next и ползунок перемотки.
 * Бар есть всегда — пока ничего не выбрано, показывает подсказку.
 */
export function PlayerBar() {
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
  const store = useQueueStore()
  const { current, position, count, error, playing, currentTime, duration, toggle, next, prev, seek } =
    usePlayer()

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
        sx={{ flexWrap: { xs: 'wrap', sm: 'nowrap' }, width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: { xs: 1, sm: 2 } }}
      >
        <Stack direction="row" spacing={1.5} sx={{ flex: { xs: '1 1 calc(100% - 150px)', sm: '1 1 0' }, minWidth: 0, alignItems: 'center' }}>
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
              {current?.name ?? 'Выберите трек'}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Typography title={current?.artist ?? undefined} noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {current?.artist ?? 'Плеер готов к работе'}
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
                  {position} / {count}
                </Typography>
              )}
            </Stack>
          </Box>
        </Stack>

        <Stack spacing={0.5} sx={{ order: { xs: 3, sm: 0 }, width: { xs: '100%', sm: '46%' }, maxWidth: { sm: 560 }, flexShrink: 0, alignItems: 'center' }}>
          {/* Управление */}
          <Stack
            direction="row"
            spacing={0.5}
            sx={{ alignItems: 'center', justifyContent: 'center' }}
          >
            <IconButton size="small" onClick={prev} disabled={!hasTrack} aria-label="Предыдущий">
              <SkipPreviousRounded />
            </IconButton>
            <IconButton
              onClick={toggle}
              disabled={!hasTrack || !current?.audio}
              aria-label={playing ? 'Пауза' : 'Играть'}
              sx={{
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': { bgcolor: 'primary.dark' },
                '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
              }}
            >
              {playing ? <PauseRounded /> : <PlayArrowRounded />}
            </IconButton>
            <IconButton size="small" onClick={next} disabled={!hasTrack} aria-label="Следующий">
              <SkipNextRounded />
            </IconButton>
          </Stack>

          {/* Перемотка */}
          <Stack
            direction="row"
            spacing={1}
            sx={{
              width: '100%',
              minWidth: 0,
              alignItems: 'center',
            }}
          >
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', minWidth: 32, display: { xs: 'none', sm: 'block' } }}>
              {formatTime(currentTime)}
            </Typography>
            <Slider
              size="small"
              aria-label="Позиция воспроизведения"
              getAriaValueText={(value) => `${formatTime(value)} из ${formatTime(duration)}`}
              value={Math.min(currentTime, duration || 0)}
              max={duration || 1}
              onChange={(_event, value) => seek(Number(value))}
              disabled={!hasTrack || !current?.audio || duration === 0}
              sx={{ mx: 1, minWidth: 0 }}
            />
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', minWidth: 32, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
              {formatTime(duration)}
            </Typography>
          </Stack>
        </Stack>

        <Box sx={{ flex: { xs: '0 1 auto', sm: '1 1 0' }, minWidth: 0, flexWrap: 'wrap', display: 'flex', justifyContent: 'flex-end' }}>
          {current && <FavoriteButton trackId={current._id} name={current.name} />}
          <Button size="small" sx={{ minWidth: 0, overflowWrap: 'anywhere' }} aria-label={`Открыть очередь, ${count} из 100`} onClick={() => setQueueOpen(true)}>Очередь {count}/100</Button>
        </Box>
      </Stack>
      {error && <Alert severity={error.includes('повреждена') || error.includes('только в этой вкладке') ? 'warning' : 'error'}
        action={error.includes('повреждена') ? <Button color="inherit" size="small" onClick={() => { clearGuestQueue(); void store.refresh() }}>Сбросить гостевую очередь</Button> : undefined}>{error}</Alert>}
    </Box>
    <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
  </>
}
