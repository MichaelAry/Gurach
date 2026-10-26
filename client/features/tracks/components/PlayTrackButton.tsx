'use client'

import PauseRounded from '@mui/icons-material/PauseRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import { Button } from '@mui/material'

import { usePlayer } from '@/components/player/PlayerProvider'
import type { ITrack } from '@/types/track'

/**
 * Кнопка «Слушать» на странице трека: серверная страница не может
 * вызвать контекст плеера напрямую, поэтому кнопка — клиентский компонент.
 */
export function PlayTrackButton({ track }: { track: ITrack }) {
  const { current, playing, play } = usePlayer()
  const isCurrent = current?._id === track._id
  const isPlaying = isCurrent && playing

  return (
    <Button
      variant="contained"
      startIcon={isPlaying ? <PauseRounded /> : <PlayArrowRounded />}
      disabled={!track.audio}
      onClick={() => play(track)}
      sx={{
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        '&:hover': { bgcolor: 'primary.dark' },
      }}
    >
      {isPlaying ? 'Пауза' : track.audio ? 'Слушать' : 'Аудио недоступно'}
    </Button>
  )
}
