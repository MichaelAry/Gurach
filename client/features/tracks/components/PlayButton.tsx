'use client'

import PauseRounded from '@mui/icons-material/PauseRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import { IconButton } from '@mui/material'

import { usePlayer } from '@/components/player/PlayerProvider'
import type { ITrack } from '@/types/track'

interface PlayButtonProps {
  track: ITrack
  /** Очередь воспроизведения — обычно весь список страницы. */
  queue: ITrack[]
}

/**
 * Кнопка ▶ в строке списка: запускает трек в глобальном плеере,
 * не уходя со страницы (click по <Link> гасим через preventDefault).
 */
export function PlayButton({ track, queue }: PlayButtonProps) {
  const { current, playing, play } = usePlayer()
  const isCurrent = current?._id === track._id
  const isPlaying = isCurrent && playing

  return (
    <IconButton
      size="small"
      disabled={!track.audio}
      aria-label={isPlaying ? 'Пауза' : 'Играть'}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        play(track, queue)
      }}
      sx={{
        color: isPlaying ? 'primary.main' : 'text.secondary',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {isPlaying ? <PauseRounded fontSize="small" /> : <PlayArrowRounded fontSize="small" />}
    </IconButton>
  )
}
