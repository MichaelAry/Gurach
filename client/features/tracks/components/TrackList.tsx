'use client'

import type { TrackListItem } from '../types'
import { useMemo, useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { TrackRow } from './TrackRow'
import { useQueue, useQueueStore } from '@/features/queue/hooks'
import { createOccurrence } from '@/features/queue/commands'

export function TrackList({ tracks }: { tracks: TrackListItem[] }) {
  const store = useQueueStore(), queue = useQueue()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selected = useMemo(() => tracks.filter((track) => selectedIds.has(track._id) && track.audio), [tracks, selectedIds])
  const remaining = 100 - queue.canonical.entries.length
  const disabled = queue.status !== 'ready'
  async function bulk(type: 'append' | 'replace') {
    if (!selected.length || disabled || (type === 'append' && selected.length > remaining)) return
    if (type === 'replace' && queue.canonical.entries.length && !window.confirm(`Заменить текущую очередь из ${queue.canonical.entries.length} вхождений на ${selected.length} выбранных?`)) return
    const saved = await store.dispatch({ type, entries: selected.map((track) => createOccurrence(track)) })
    if (saved) setSelectedIds(new Set())
  }

  return (
    <Stack direction="column" spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" aria-live="polite">Выбрано {selected.length}; свободно {remaining} из 100</Typography>
        <Button size="small" disabled={!selected.length || disabled || selected.length > remaining} onClick={() => void bulk('append')}>Добавить выбранные</Button>
        <Button size="small" disabled={!selected.length || disabled} onClick={() => void bulk('replace')}>Заменить выбранными</Button>
        {selectedIds.size > 0 && <Button size="small" onClick={() => setSelectedIds(new Set())}>Снять выбор</Button>}
      </Stack>
      {selected.length > remaining && <Alert severity="warning">Выбранных треков больше свободных мест. Снимите выбор с части строк.</Alert>}
      {tracks.map((track) => (
        <TrackRow key={track._id} track={track} selectionEnabled selected={selectedIds.has(track._id)}
          onSelectionChange={(checked) => setSelectedIds((old) => { const next = new Set(old); if (checked) next.add(track._id); else next.delete(track._id); return next })} />
      ))}
    </Stack>
  )
}
