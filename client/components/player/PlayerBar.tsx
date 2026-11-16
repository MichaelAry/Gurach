'use client'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { useEffect, useRef, useState } from 'react'

import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded'
import VolumeOffRounded from '@mui/icons-material/VolumeOffRounded'
import RepeatRounded from '@mui/icons-material/RepeatRounded'
import RepeatOneRounded from '@mui/icons-material/RepeatOneRounded'
import ShuffleRounded from '@mui/icons-material/ShuffleRounded'
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
  const { current, position, count, error, audioError, retryAudio, retrying, oneOff, playing, currentTime, duration, toggle, next, prev, seek, volume, muted, repeat, shuffle, setVolume, toggleMute, cycleRepeat, toggleShuffle } =
    usePlayer()

  const hasTrack = Boolean(current?._id)
  const cover = current?.picture
  const repeatLabel = repeat === 'off' ? 'Повтор выключен' : repeat === 'all' ? 'Повтор всей очереди' : 'Повтор одного трека'

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
                  {oneOff ? 'Разовое воспроизведение' : `${position} / ${count}`}
                </Typography>
              )}
            </Stack>
          </Box>
        </Stack>

        <Stack spacing={0.5} sx={{ order: { xs: 3, md: 0 }, width: { xs: '100%', md: '46%' }, maxWidth: { md: 560 }, flexShrink: 0, alignItems: 'center' }}>
          {/* Управление */}
          <Stack
            direction="row"
            spacing={0.5}
            sx={{ alignItems: 'center', justifyContent: 'center' }}
          >
            <IconButton size="small" onClick={toggleShuffle} aria-label="Перемешать порядок воспроизведения" aria-pressed={shuffle} color={shuffle ? 'primary' : 'default'} sx={{ minWidth: 44, minHeight: 44 }}>
              <ShuffleRounded />
            </IconButton>
            <IconButton size="small" onClick={prev} sx={{ minWidth: 44, minHeight: 44 }} disabled={!hasTrack} aria-label="Предыдущий">
              <SkipPreviousRounded />
            </IconButton>
            <IconButton
              onClick={toggle}
              disabled={!hasTrack || !current?.audio}
              aria-label={playing ? 'Пауза' : 'Играть'}
              sx={{
                minWidth: 44, minHeight: 44,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': { bgcolor: 'primary.dark' },
                '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
              }}
            >
              {playing ? <PauseRounded /> : <PlayArrowRounded />}
            </IconButton>
            <IconButton size="small" onClick={next} sx={{ minWidth: 44, minHeight: 44 }} disabled={!hasTrack} aria-label="Следующий">
              <SkipNextRounded />
            </IconButton>
            <IconButton size="small" onClick={cycleRepeat} aria-label={`${repeatLabel}. Переключить режим повтора`} title={repeatLabel} aria-pressed={repeat !== 'off'} color={repeat !== 'off' ? 'primary' : 'default'} sx={{ minWidth: 44, minHeight: 44 }}>
              {repeat === 'one' ? <RepeatOneRounded /> : <RepeatRounded />}
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

        <Box sx={{ order: { xs: 4, md: 0 }, flex: { xs: '1 1 100%', md: '0 1 280px' }, minWidth: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1 }}>
          <Stack direction="row" spacing={1} sx={{ flex: '1 1 110px', minWidth: 80, maxWidth: 140, mr: 'auto', alignItems: 'center', px: 1 }}>
            <IconButton onClick={toggleMute} aria-label="Без звука" aria-pressed={muted} title={muted ? 'Включить звук' : 'Выключить звук'} sx={{ minWidth: 44, minHeight: 44 }}>
              {muted || volume === 0 ? <VolumeOffRounded /> : <VolumeUpRounded />}
            </IconButton>
            <Slider size="small" aria-label="Громкость" getAriaValueText={(value) => `${value}%`} value={Math.round(volume * 100)} max={100}
              onChange={(_event, value) => setVolume(Number(value) / 100)} sx={{ minWidth: 0 }} />
          </Stack>
          {current && <FavoriteButton trackId={current._id} name={current.name} />}
          <Button size="small" sx={{ minWidth: 0, whiteSpace: 'nowrap' }} aria-label={`Открыть очередь, ${count} из 100`} onClick={() => setQueueOpen(true)}>Очередь {count}/100</Button>
        </Box>
      </Stack>
      {error && <Alert severity={error.includes('повреждена') || error.includes('только в этой вкладке') ? 'warning' : 'error'}
        action={audioError ? <Button color="inherit" size="small" disabled={retrying} onClick={retryAudio}>{retrying ? 'Повторяем…' : 'Повторить аудио'}</Button> : error.includes('повреждена') ? <Button color="inherit" size="small" onClick={() => { clearGuestQueue(); void store.refresh() }}>Сбросить гостевую очередь</Button> : undefined}>{error}</Alert>}
    </Box>
    <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
  </>
}
