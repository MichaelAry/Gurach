'use client'

import PauseRounded from '@mui/icons-material/PauseRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import { IconButton } from '@mui/material'

import { usePlayerTransport } from '@/components/player/PlayerProvider'
import type { TrackListItem } from '../types'

interface PlayButtonProps {
  track: TrackListItem
}

/**
 * Кнопка ▶ в строке списка: запускает трек в глобальном плеере,
 * без перехода на страницу трека.
 */
export function PlayButton({ track }: PlayButtonProps) {
  const { current, playing, play, pending } = usePlayerTransport()
  const isCurrent = current?._id === track._id
  const isPlaying = isCurrent && playing

  return (
    <IconButton
      size="small"
      disabled={!track.audio || pending}
      aria-label={`${isPlaying ? 'Пауза' : 'Играть'} ${track.name}`}
      onClick={() => play(track)}
      sx={{
        color: isPlaying ? 'primary.main' : 'text.secondary',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {isPlaying ? (
        <PauseRounded fontSize="small" />
      ) : (
        <PlayArrowRounded fontSize="small" />
      )}
    </IconButton>
  )
}
