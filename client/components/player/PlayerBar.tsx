'use client'

import PauseRounded from '@mui/icons-material/PauseRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import SkipNextRounded from '@mui/icons-material/SkipNextRounded'
import SkipPreviousRounded from '@mui/icons-material/SkipPreviousRounded'
import { Box, IconButton, Slider, Stack, Typography } from '@mui/material'
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
  const { current, playing, currentTime, duration, toggle, next, prev, seek } =
    usePlayer()

  const hasTrack = Boolean(current?._id)
  const cover = current?.picture

  return (
    <Box
      component="footer"
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
        py: 1,
      }}
    >
      <Stack
        direction="row"
        spacing={2}
        sx={{ maxWidth: 1000, mx: 'auto', alignItems: 'center' }}
      >
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

        {/* Название */}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: '0.9rem', fontWeight: 600 }}>
            {current?.name ?? 'Выберите трек'}
          </Typography>
          <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            {current?.artist ?? 'Плеер готов к работе'}
          </Typography>
        </Box>

        {/* Управление */}
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ alignItems: 'center' }}
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
              color: '#fff',
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
          sx={{ flex: 2, minWidth: 160, alignItems: 'center' }}
        >
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', minWidth: 32 }}>
            {formatTime(currentTime)}
          </Typography>
          <Slider
            size="small"
            value={Math.min(currentTime, duration || 0)}
            max={duration || 1}
            onChange={(_event, value) => seek(Number(value))}
            disabled={!hasTrack || !current?.audio || duration === 0}
            sx={{ mx: 1 }}
          />
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', minWidth: 32, textAlign: 'right' }}>
            {formatTime(duration)}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  )
}
