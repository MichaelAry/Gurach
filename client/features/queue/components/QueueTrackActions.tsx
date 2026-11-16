'use client'
import { useText } from '@/i18n/LocaleProvider'
import { IconButton, Stack, Tooltip } from '@mui/material'
import AddToQueue from '@mui/icons-material/AddToQueue'
import { createOccurrence } from '../commands'
import { useQueue, useQueueStore } from '../hooks'
import type { TrackListItem } from '@/features/tracks/types'

export function QueueTrackActions({ track }: { track: TrackListItem }) {
  const lt = useText()

  const store = useQueueStore(), state = useQueue()
  const disabled = !track.audio || state.status !== 'ready' || state.canonical.entries.length >= 100
  function add() {
    if (disabled) return
    void store.dispatch({ type: 'append', entries: [createOccurrence(track)] })
  }
  return <Stack direction="row" spacing={0}>
    <Tooltip title={lt('addToQueue')}><span><IconButton size="small" disabled={disabled} aria-label={lt('addToQueue293', { p0: track.name })} onClick={add}><AddToQueue fontSize="small" /></IconButton></span></Tooltip>
  </Stack>
}
