'use client'
import { useText, useMessage } from '@/i18n/LocaleProvider'
import { message as localMessage } from '@/i18n/messages'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from '@mui/material'
import { useQueue, useQueueStore } from '../hooks'
import type { QueueEntry } from '../types'
import { guestImportResolved, loadGuestQueueForImport, markGuestImportResolved } from '../guestAdapter'
import { useViewer } from '@/features/auth/ViewerProvider'

export function GuestQueueImport({ userId }: { userId: string }) {
  const resolve = useMessage()

  const lt = useText()

  const { confirmed, isConfirmed } = useViewer()
  const store = useQueueStore(), queue = useQueue()
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolved, setResolved] = useState(() => guestImportResolved(userId))
  const selection = useMemo(() => entries.filter((entry) => selected.has(entry.entryId)), [entries, selected])
  const remaining = 100 - queue.canonical.entries.length

  useEffect(() => {
    let active = true
    if (!confirmed || queue.status !== 'ready' || guestImportResolved(userId)) return
    void loadGuestQueueForImport().then((snapshot) => {
      if (!active) return
      const manualEntries = snapshot?.entries.filter((entry) => entry.source !== 'automatic') ?? []
      if (!manualEntries.length) { markGuestImportResolved(userId); setResolved(true); return }
      setEntries(manualEntries)
      setSelected(new Set(manualEntries.filter((entry) => entry.availability === 'playable' && entry.track?.audio).map((entry) => entry.entryId)))
      setOpen(true)
    }).catch(() => { if (active) setError(localMessage('couldNotReadTheGuestQueueTryAgainLater')) })
    return () => { active = false }
  }, [queue.status, userId, confirmed])

  function finish() {
    if (!markGuestImportResolved(userId)) { setError(localMessage('couldNotSaveYourChoiceInThisBrowserYour')) }
    setResolved(true); setOpen(false)
  }
  async function choose(mode: 'replace' | 'append') {
    if (!isConfirmed(userId) || busy || !selection.length) return
    if (mode === 'append' && selection.length > remaining) { setError(localMessage('selectedButOnlySpacesRemainDeselectSomeEntriesOr', { p0: selection.length, p1: remaining })); return }
    if (selection.some((entry) => entry.availability !== 'playable' || !entry.track?.audio)) { setError(localMessage('deselectUnavailableTracksBeforeImporting')); return }
    setBusy(true); setError(null)
    try {
      const entriesToImport = selection.map((entry) => ({ ...entry, entryId: crypto.randomUUID() }))
      const saved = await store.dispatch({ type: mode, entries: entriesToImport })
      if (saved) finish()
      else setError(store.getSnapshot().error ?? localMessage('theQueueWasNotSavedCheckItsStateAnd'))
    } finally { setBusy(false) }
  }

  if (resolved || !open) return error ? <Alert severity="warning">{resolve(error)}</Alert> : null
  return <Dialog open={open} onClose={() => { if (!busy) { setOpen(false); setResolved(true) } }} fullWidth maxWidth="sm" aria-labelledby="guest-queue-import-title">
    <DialogTitle id="guest-queue-import-title">{lt('guestQueue')}</DialogTitle>
    <DialogContent>
      <Stack spacing={1}>
        <Typography>{lt('importDescription', { count: queue.canonical.entries.length })}</Typography>
        {entries.map((entry, index) => <FormControlLabel key={entry.entryId}
          control={<Checkbox checked={selected.has(entry.entryId)} onChange={(event) => setSelected((old) => {
          const next = new Set(old)
          if (event.target.checked) next.add(entry.entryId)
          else next.delete(entry.entryId)
          return next
          })} />}
          label={`${index + 1}. ${entry.display.name}${entry.display.artist ? ` — ${entry.display.artist}` : ''}${entry.availability === 'unavailable' ? lt('unavailable258', { p0: entry.reason }) : ''}`} />)}
        {selection.length > remaining && <Alert severity="info">{lt('youSelectedMoreEntriesThanThereIsSpaceFor')}</Alert>}
        {error && <Alert severity="error">{resolve(error)}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ flexWrap: 'wrap' }}>
      <Button disabled={busy} onClick={finish}>{lt('keepAccountQueue')}</Button>
      <Button disabled={busy || !confirmed || !selection.length || selection.some((entry) => entry.availability !== 'playable' || !entry.track?.audio)} onClick={() => void choose('replace')}>{lt('replaceWithSelected')}</Button>
      <Button disabled={busy || !confirmed || !selection.length || selection.length > remaining || selection.some((entry) => entry.availability !== 'playable' || !entry.track?.audio)} onClick={() => void choose('append')}>{lt('mergeSelected')}</Button>
    </DialogActions>
  </Dialog>
}
