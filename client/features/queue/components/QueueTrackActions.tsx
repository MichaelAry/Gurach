'use client'
import { IconButton, Stack, Tooltip } from '@mui/material'
import AddToQueue from '@mui/icons-material/AddToQueue'
import { createOccurrence } from '../commands'
import { useQueue, useQueueStore } from '../hooks'
import type { TrackListItem } from '@/features/tracks/types'

export function QueueTrackActions({ track }: { track: TrackListItem }) {
  const store = useQueueStore(), state = useQueue()
  const disabled = !track.audio || state.status !== 'ready' || state.canonical.entries.length >= 100
  function add() {
    if (disabled) return
    void store.dispatch({ type: 'append', entries: [createOccurrence(track)] })
  }
  return <Stack direction="row" spacing={0}>
    <Tooltip title="Добавить в очередь"><span><IconButton size="small" disabled={disabled} aria-label={`Добавить в очередь: ${track.name}`} onClick={add}><AddToQueue fontSize="small" /></IconButton></span></Tooltip>
  </Stack>
}
