'use client'
import { useState } from 'react'
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Drawer, FormControlLabel, Stack, TextField, Typography, useMediaQuery } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { usePlayerTransport } from '@/features/player/PlayerProvider'
import { useQueue, useQueueStore } from '../hooks'
import { QueueRow } from './QueueRow'

export function QueuePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useQueueStore(), state = useQueue()
  const player = usePlayerTransport()
  const theme = useTheme(), mobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [confirmClear, setConfirmClear] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [removeFirstOpen, setRemoveFirstOpen] = useState(false)
  const [firstCount, setFirstCount] = useState('1')
  const entries = state.preview ?? state.canonical.entries
  const busy = state.status === 'pending' || state.status === 'loading'
  const disabled = state.status !== 'ready'
  const checkedEntries = state.canonical.entries.filter((entry) => checkedIds.has(entry.entryId))
  const count = Number(firstCount)
  const validCount = /^\d+$/.test(firstCount) && Number.isSafeInteger(count) && count >= 1 && count <= state.canonical.entries.length
  function toggleChecked(entryId: string) {
    setCheckedIds((previous) => {
      const next = new Set(previous)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }
  async function removeChecked() {
    if (!checkedEntries.length) return
    if (await store.dispatch({ type: 'removeMany', entryIds: checkedEntries.map((entry) => entry.entryId) })) setCheckedIds(new Set())
  }
  async function removeFirst() {
    if (!validCount) return
    if (await store.dispatch({ type: 'removeFirst', count })) setRemoveFirstOpen(false)
  }
  function move(from: number, to: number) {
    if (from === to || disabled) return
    const ids = entries.map((entry) => entry.entryId)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    void store.dispatch({ type: 'reorder', entryIds: ids })
  }
  async function clear() {
    const saved = await store.dispatch({ type: 'clear' })
    if (saved) {
      setCheckedIds(new Set())
      setConfirmClear(false)
      onClose()
    }
  }

  return <>
    <Drawer open={open} onClose={onClose} anchor={mobile ? 'bottom' : 'right'} ModalProps={{ keepMounted: true }}>
      <Box component="section" aria-label="Очередь воспроизведения" sx={{ width: mobile ? '100vw' : { sm: 380, md: 440 }, height: mobile ? '82vh' : '100%', display: 'flex', flexDirection: 'column', p: 2, pb: mobile ? 3 : 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography component="h2" variant="h6">Очередь воспроизведения</Typography>
            <Typography variant="body2" color="text.secondary" aria-live="polite">{entries.length} / 100 треков</Typography>
          </Box>
          <Button onClick={onClose}>Закрыть</Button>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ my: 1, flexWrap: 'wrap' }}>
          <Button size="small" disabled={!entries.length || disabled} onClick={() => setConfirmClear(true)}>Очистить</Button>
          <Button size="small" disabled={!entries.length || disabled} onClick={() => { setFirstCount('1'); setRemoveFirstOpen(true) }}>Убрать первые…</Button>
          <Button size="small" disabled={!entries.some((entry) => entry.availability !== 'playable') || disabled}
            onClick={() => void store.dispatch({ type: 'removeUnavailable' })}>Убрать недоступные</Button>
          {state.status === 'conflict' && <Button size="small" onClick={() => void store.refresh()}>Обновить очередь</Button>}
          {state.status === 'error' && store.hasPendingMutation() && <Button size="small" onClick={() => void store.retry()}>Повторить сохранение</Button>}
          {state.status === 'error' && !store.hasPendingMutation() && <Button size="small" onClick={() => void store.refresh()}>Повторить загрузку</Button>}
        </Stack>
        {entries.length > 0 && <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControlLabel label="Выбрать все" sx={{ mr: 0 }} control={<Checkbox size="small" disabled={disabled}
            checked={checkedEntries.length > 0 && checkedEntries.length === state.canonical.entries.length}
            indeterminate={checkedEntries.length > 0 && checkedEntries.length < state.canonical.entries.length}
            onChange={(_, checked) => setCheckedIds(checked ? new Set(entries.map((entry) => entry.entryId)) : new Set())} />} />
          <Typography variant="body2" aria-live="polite">Выбрано: {checkedEntries.length}</Typography>
          <Button size="small" color="error" disabled={!checkedEntries.length || disabled} onClick={() => void removeChecked()}>Убрать выбранные</Button>
        </Stack>}
        {state.status === 'loading' && <Typography role="status">Загружаем очередь…</Typography>}
        {state.status === 'pending' && <Typography role="status">Сохраняем очередь…</Typography>}
        {state.error && <Alert severity={state.status === 'conflict' ? 'warning' : 'error'} role="alert">{state.error}</Alert>}
        {!entries.length && state.status !== 'loading' && <Typography sx={{ mt: 2 }} color="text.secondary">Очередь пуста. Добавьте треки из каталога.</Typography>}
        <Box component="ol" aria-label="Треки в очереди" sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 0, mt: 1, overflowY: 'auto', minHeight: 0 }}>
          {entries.map((entry, index) => <QueueRow key={entry.entryId} entry={entry} index={index} total={entries.length} disabled={disabled}
            checked={checkedIds.has(entry.entryId)} onCheck={() => toggleChecked(entry.entryId)}
            current={state.selectedEntryId === entry.entryId} playing={player.playing && state.selectedEntryId === entry.entryId}
            onSelect={() => player.selectEntry(entry.entryId)} onRemove={() => void store.dispatch({ type: 'remove', entryId: entry.entryId })}
            onMove={(direction) => move(index, index + direction)} onDrop={move} />)}
        </Box>
      </Box>
    </Drawer>
    <Dialog open={confirmClear} onClose={() => { if (!busy) setConfirmClear(false) }} aria-labelledby="clear-queue-title">
      <DialogTitle id="clear-queue-title">Очистить очередь?</DialogTitle>
      <DialogContent>
        Все {state.canonical.entries.length} треков будут удалены из очереди.
        {state.error && <Alert severity="error" sx={{ mt: 2 }}>{state.error}</Alert>}
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setConfirmClear(false)}>Отмена</Button><Button color="error" onClick={() => void clear()} disabled={disabled || !entries.length}>Очистить</Button></DialogActions>
    </Dialog>
    <Dialog open={removeFirstOpen} onClose={() => { if (!busy) setRemoveFirstOpen(false) }} aria-labelledby="remove-first-title" fullWidth maxWidth="xs">
      <Box component="form" onSubmit={(event) => { event.preventDefault(); if (!disabled) void removeFirst() }}>
        <DialogTitle id="remove-first-title">Убрать первые треки</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>Треки будут удалены с начала очереди, включая текущий, если он входит в это число.</Typography>
          <TextField autoFocus fullWidth label="Количество треков" type="number" value={firstCount} disabled={disabled}
            onChange={(event) => setFirstCount(event.target.value)} error={!validCount}
            helperText={`Введите целое число от 1 до ${state.canonical.entries.length}`}
            slotProps={{ htmlInput: { min: 1, max: state.canonical.entries.length, step: 1 } }} />
          {state.error && <Alert severity="error" sx={{ mt: 2 }}>{state.error}</Alert>}
        </DialogContent>
        <DialogActions><Button disabled={busy} onClick={() => setRemoveFirstOpen(false)}>Отмена</Button><Button type="submit" color="error" disabled={disabled || !validCount}>Убрать</Button></DialogActions>
      </Box>
    </Dialog>
  </>
}
