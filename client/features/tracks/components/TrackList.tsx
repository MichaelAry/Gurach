'use client'
import { useText } from '@/i18n/LocaleProvider'

import type { TrackListItem } from '../types'
import { useMemo, useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { TrackRow } from './TrackRow'
import { useQueue } from '@/features/queue/hooks'
import { createOccurrence } from '@/features/queue/commands'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ActionFeedback } from '@/components/ui/ActionFeedback'
import { useQueueAction } from '@/features/queue/useQueueAction'
import { message } from '@/i18n/messages'
import type { QueueEntry } from '@/features/queue/types'

export function TrackList({ tracks }: { tracks: TrackListItem[] }) {
  const lt = useText()

  const queue = useQueue()
  const action = useQueueAction()
  const [replacement, setReplacement] = useState<{ entries: QueueEntry[]; revision: number } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selected = useMemo(() => tracks.filter((track) => selectedIds.has(track._id) && track.audio), [tracks, selectedIds])
  const remaining = 100 - queue.canonical.entries.length
  const disabled = queue.status !== 'ready'
  async function bulk(type: 'append' | 'replace', confirmed = false) {
    if (!selected.length || disabled || (type === 'append' && selected.length > remaining)) return
    if (type === 'replace' && queue.canonical.entries.length && !confirmed) {
      action.reset()
      setReplacement({ entries: selected.map((track) => createOccurrence(track)), revision: queue.canonical.revision })
      return
    }
    const saved = await action.run({ type, entries: confirmed && replacement ? replacement.entries : selected.map((track) => createOccurrence(track)) }, message('queueUpdated'), confirmed ? replacement?.revision : undefined)
    if (saved) { setSelectedIds(new Set()); setReplacement(null) }
  }

  return (
    <Stack direction="column" spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" aria-live="polite">{lt('selection', { count: selected.length, remaining })}</Typography>
        <Button size="small" disabled={!selected.length || disabled || selected.length > remaining} onClick={() => void bulk('append')}>{lt('addSelected')}</Button>
        <Button size="small" disabled={!selected.length || disabled} onClick={() => void bulk('replace')}>{lt('replaceWithSelected')}</Button>
        {selectedIds.size > 0 && <Button size="small" onClick={() => setSelectedIds(new Set())}>{lt('deselectAll')}</Button>}
      </Stack>
      {!replacement && <ActionFeedback {...action.feedback} />}
      <ConfirmDialog open={Boolean(replacement)} title={lt('replaceWithSelected')} confirmLabel={lt('replaceWithSelected')}
        busy={queue.status === 'pending'} disabled={disabled} destructive onClose={() => setReplacement(null)} onConfirm={() => void bulk('replace', true)}>
        <Typography>{lt('replaceTheCurrentQueueOfEntriesWithSelectedEntries', { p0: queue.canonical.entries.length, p1: replacement?.entries.length ?? 0 })}</Typography>
        <ActionFeedback {...action.feedback} />
      </ConfirmDialog>
      {selected.length > remaining && <Alert severity="warning">{lt('youSelectedMoreTracksThanThereIsSpaceFor')}</Alert>}
      {tracks.map((track) => (
        <TrackRow key={track._id} track={track} selectionEnabled selected={selectedIds.has(track._id)}
          onSelectionChange={(checked) => setSelectedIds((old) => { const next = new Set(old); if (checked) next.add(track._id); else next.delete(track._id); return next })} />
      ))}
    </Stack>
  )
}
