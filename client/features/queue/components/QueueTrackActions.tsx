'use client'
import { IconButton, Stack, Tooltip } from '@mui/material'
import AddToQueue from '@mui/icons-material/AddToQueue'
import SkipNext from '@mui/icons-material/SkipNext'
import { createOccurrence } from '../commands'
import { useQueue, useQueueStore } from '../hooks'
import type { TrackListItem } from '@/features/tracks/types'

export function QueueTrackActions({ track }: { track: TrackListItem }) {
  const store = useQueueStore(), state = useQueue()
  const disabled = !track.audio || state.status !== 'ready' || state.canonical.entries.length >= 100
  function add(type: 'append' | 'play-next') {
    if (disabled) return
    void store.dispatch({ type, entries: [createOccurrence(track)] })
  }
  return <Stack direction="row" spacing={0}>
    <Tooltip title="Добавить в очередь"><span><IconButton size="small" disabled={disabled} aria-label={`Добавить в очередь: ${track.name}`} onClick={() => add('append')}><AddToQueue fontSize="small" /></IconButton></span></Tooltip>
    <Tooltip title="Добавить в конец ручной очереди"><span><IconButton size="small" disabled={disabled} aria-label={`В ручную очередь: ${track.name}`} onClick={() => add('play-next')}><SkipNext fontSize="small" /></IconButton></span></Tooltip>
  </Stack>
}
