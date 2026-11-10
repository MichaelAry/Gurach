'use client'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from '@mui/material'
import { useQueue, useQueueStore } from '../hooks'
import type { QueueEntry } from '../types'
import { guestImportResolved, loadGuestQueueForImport, markGuestImportResolved } from '../guestAdapter'

export function GuestQueueImport({ userId }: { userId: string }) {
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
    if (queue.status !== 'ready' || guestImportResolved(userId)) return
    void loadGuestQueueForImport().then((snapshot) => {
      if (!active) return
      const manualEntries = snapshot?.entries.filter((entry) => entry.source !== 'automatic') ?? []
      if (!manualEntries.length) { markGuestImportResolved(userId); setResolved(true); return }
      setEntries(manualEntries)
      setSelected(new Set(manualEntries.filter((entry) => entry.availability === 'playable' && entry.track?.audio).map((entry) => entry.entryId)))
      setOpen(true)
    }).catch(() => { if (active) setError('Не удалось прочитать гостевую очередь. Повторите позже.') })
    return () => { active = false }
  }, [queue.status, userId])

  function finish() {
    if (!markGuestImportResolved(userId)) { setError('Решение не удалось сохранить в этом браузере. Очередь аккаунта уже сохранена; закройте окно вручную.') }
    setResolved(true); setOpen(false)
  }
  async function choose(mode: 'replace' | 'append') {
    if (busy || !selection.length) return
    if (mode === 'append' && selection.length > remaining) { setError(`Выбрано ${selection.length}, свободно только ${remaining}. Снимите часть отметок или замените очередь.`); return }
    if (selection.some((entry) => entry.availability !== 'playable' || !entry.track?.audio)) { setError('Снимите отметки с недоступных треков перед импортом.'); return }
    setBusy(true); setError(null)
    try {
      const entriesToImport = selection.map((entry) => ({ ...entry, entryId: crypto.randomUUID() }))
      const saved = await store.dispatch({ type: mode, entries: entriesToImport })
      if (saved) finish()
      else setError(store.getSnapshot().error ?? 'Очередь не сохранена. Проверьте состояние и повторите.')
    } finally { setBusy(false) }
  }

  if (resolved || !open) return error ? <Alert severity="warning">{error}</Alert> : null
  return <Dialog open={open} onClose={() => { if (!busy) { setOpen(false); setResolved(true) } }} fullWidth maxWidth="sm" aria-labelledby="guest-queue-import-title">
    <DialogTitle id="guest-queue-import-title">Гостевая очередь</DialogTitle>
    <DialogContent>
      <Stack spacing={1}>
        <Typography>Выберите вхождения для переноса. Повторы сохраняются. В очереди аккаунта: {queue.canonical.entries.length}/100.</Typography>
        {entries.map((entry, index) => <FormControlLabel key={entry.entryId}
          control={<Checkbox checked={selected.has(entry.entryId)} onChange={(event) => setSelected((old) => {
          const next = new Set(old)
          if (event.target.checked) next.add(entry.entryId)
          else next.delete(entry.entryId)
          return next
          })} />}
          label={`${index + 1}. ${entry.display.name}${entry.display.artist ? ` — ${entry.display.artist}` : ''}${entry.availability === 'unavailable' ? ` (недоступен: ${entry.reason})` : ''}`} />)}
        {selection.length > remaining && <Alert severity="info">Выбрано больше свободного места. Снимите часть отметок или замените очередь.</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ flexWrap: 'wrap' }}>
      <Button disabled={busy} onClick={finish}>Оставить очередь аккаунта</Button>
      <Button disabled={busy || !selection.length || selection.some((entry) => entry.availability !== 'playable' || !entry.track?.audio)} onClick={() => void choose('replace')}>Заменить выбранными</Button>
      <Button disabled={busy || !selection.length || selection.length > remaining || selection.some((entry) => entry.availability !== 'playable' || !entry.track?.audio)} onClick={() => void choose('append')}>Объединить выбранные</Button>
    </DialogActions>
  </Dialog>
}
