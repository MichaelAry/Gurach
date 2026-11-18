'use client'
import { useText } from '@/i18n/LocaleProvider'

import PauseRounded from '@mui/icons-material/PauseRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import { Button } from '@mui/material'

import { usePlayerTransport } from '@/components/player/PlayerProvider'
import type { TrackDetail } from '../types'

/**
 * Кнопка «Слушать» на странице трека: серверная страница не может
 * вызвать контекст плеера напрямую, поэтому кнопка — клиентский компонент.
 */
export function PlayTrackButton({ track }: { track: TrackDetail }) {
  const lt = useText()

  const { current, playing, play, pending } = usePlayerTransport()
  const isCurrent = current?._id === track._id
  const isPlaying = isCurrent && playing

  return (
    <Button
      variant="contained"
      startIcon={isPlaying ? <PauseRounded /> : <PlayArrowRounded />}
      disabled={!track.audio || pending}
      onClick={() => play(track)}
      sx={{
        bgcolor: isCurrent ? 'var(--wae-accent)' : 'primary.main',
        color: 'primary.contrastText',
        '&:hover': { bgcolor: 'primary.dark' },
      }}
    >
      {isPlaying ? lt('pause') : track.audio ? lt('listen') : lt('audioUnavailable')}
    </Button>
  )
}
