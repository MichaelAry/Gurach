'use client'
import { useText, useMessage } from '@/i18n/LocaleProvider'
import { useState } from 'react'
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Drawer, FormControlLabel, Stack, TextField, Typography, useMediaQuery } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { usePlayerTransport } from '@/features/player/PlayerProvider'
import { useQueue, useQueueStore } from '../hooks'
import { QueueRow } from './QueueRow'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ActionFeedback } from '@/components/ui/ActionFeedback'
import { useQueueAction } from '../useQueueAction'
import { message } from '@/i18n/messages'

export function QueuePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const resolve = useMessage()

  const lt = useText()

  const store = useQueueStore(), state = useQueue()
  const action = useQueueAction()
  const player = usePlayerTransport()
  const theme = useTheme(), mobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [clearRevision, setClearRevision] = useState<number | null>(null)
  const confirmClear = clearRevision !== null
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
    if (await action.run({ type: 'removeMany', entryIds: checkedEntries.map((entry) => entry.entryId) }, message('queueUpdated'))) setCheckedIds(new Set())
  }
  async function removeFirst() {
    if (!validCount) return
    if (await action.run({ type: 'removeFirst', count }, message('queueUpdated'))) setRemoveFirstOpen(false)
  }
  function move(from: number, to: number) {
    if (from === to || disabled) return
    const ids = entries.map((entry) => entry.entryId)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    void action.run({ type: 'reorder', entryIds: ids }, message('queueUpdated'))
  }
  async function clear() {
    const saved = await action.run({ type: 'clear' }, message('queueUpdated'), clearRevision ?? undefined)
    if (saved) {
      setCheckedIds(new Set())
      setClearRevision(null)
      onClose()
    }
  }

  return <>
    <Drawer open={open} onClose={onClose} anchor={mobile ? 'bottom' : 'right'} ModalProps={{ keepMounted: true }} slotProps={{ paper: { sx: { borderRadius: mobile ? '12px 12px 0 0' : 0 } } }}>
      <Box component="section" aria-label={lt('playbackQueue')} sx={{ width: mobile ? '100%' : { sm: 380, md: 440 }, height: mobile ? '86dvh' : '100dvh', maxWidth: '100vw', minHeight: 0, display: 'flex', flexDirection: 'column', p: 2, pb: 'max(16px, env(safe-area-inset-bottom))' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography component="h2" variant="h6">{lt('playbackQueue')}</Typography>
            <Typography variant="body2" color="text.secondary" aria-live="polite">{entries.length} {lt('tracks264')}</Typography>
          </Box>
          <Button onClick={onClose}>{lt('close')}</Button>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ my: 1, flexWrap: 'wrap' }}>
          <Button size="small" disabled={!entries.length || disabled} onClick={() => { action.reset(); setClearRevision(state.canonical.revision) }}>{lt('clear')}</Button>
          <Button size="small" disabled={!entries.length || disabled} onClick={() => { setFirstCount('1'); setRemoveFirstOpen(true) }}>{lt('removeFirst')}</Button>
          <Button size="small" disabled={!entries.some((entry) => entry.availability !== 'playable') || disabled}
            onClick={() => void action.run({ type: 'removeUnavailable' }, message('queueUpdated'))}>{lt('removeUnavailable')}</Button>
          {state.status === 'conflict' && <Button size="small" onClick={() => void store.refresh()}>{lt('refreshQueue')}</Button>}
          {state.status === 'error' && store.hasPendingMutation() && <Button size="small" onClick={() => void store.retry()}>{lt('retrySaving')}</Button>}
          {state.status === 'error' && !store.hasPendingMutation() && <Button size="small" onClick={() => void store.refresh()}>{lt('retryLoading')}</Button>}
        </Stack>
        {entries.length > 0 && <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControlLabel label={lt('selectAll')} sx={{ mr: 0 }} control={<Checkbox size="small" disabled={disabled}
            checked={checkedEntries.length > 0 && checkedEntries.length === state.canonical.entries.length}
            indeterminate={checkedEntries.length > 0 && checkedEntries.length < state.canonical.entries.length}
            onChange={(_, checked) => setCheckedIds(checked ? new Set(entries.map((entry) => entry.entryId)) : new Set())} />} />
          <Typography variant="body2" aria-live="polite">{lt('selected')}{checkedEntries.length}</Typography>
          <Button size="small" color="error" disabled={!checkedEntries.length || disabled} onClick={() => void removeChecked()}>{lt('removeSelected')}</Button>
        </Stack>}
        {state.status === 'loading' && <Typography role="status">{lt('loadingQueue')}</Typography>}
        {state.status === 'pending' && <Typography role="status">{lt('savingQueue')}</Typography>}
        {state.error && <Alert severity={state.status === 'conflict' ? 'warning' : 'error'} role="alert">{resolve(state.error)}</Alert>}
        {!confirmClear && <ActionFeedback error={state.error ? undefined : action.feedback.error} success={state.error ? undefined : action.feedback.success} />}
        {!entries.length && state.status !== 'loading' && <Typography sx={{ mt: 2 }} color="text.secondary">{lt('theQueueIsEmptyAddTracksFromTheCatalogue')}</Typography>}
        <Box component="ol" aria-label={lt('queuedTracks')} sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 0, mt: 1, overflowY: 'auto', minHeight: 0 }}>
          {entries.map((entry, index) => <QueueRow key={entry.entryId} entry={entry} index={index} total={entries.length} disabled={disabled}
            checked={checkedIds.has(entry.entryId)} onCheck={() => toggleChecked(entry.entryId)}
            current={player.selectedEntryId === entry.entryId} playing={player.playing && player.selectedEntryId === entry.entryId}
            onSelect={() => player.selectEntry(entry.entryId)} onRemove={() => void action.run({ type: 'remove', entryId: entry.entryId }, message('queueUpdated'))}
            onMove={(direction) => move(index, index + direction)} onDrop={move} />)}
        </Box>
      </Box>
    </Drawer>
    <ConfirmDialog open={confirmClear} onClose={() => setClearRevision(null)} title={lt('clearTheQueue')} confirmLabel={lt('clear')}
      busy={busy} disabled={disabled || !entries.length} destructive onConfirm={() => void clear()}>
      <Typography>{lt('clearQueue', { count: state.canonical.entries.length })}</Typography>
      <ActionFeedback error={state.error ?? action.feedback.error} />
    </ConfirmDialog>
    <Dialog open={removeFirstOpen} onClose={() => { if (!busy) setRemoveFirstOpen(false) }} aria-labelledby="remove-first-title" fullWidth maxWidth="xs">
      <Box component="form" onSubmit={(event) => { event.preventDefault(); if (!disabled) void removeFirst() }}>
        <DialogTitle id="remove-first-title">{lt('removeFirstTracks')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>{lt('tracksWillBeRemovedFromTheStartOfThe')}</Typography>
          <TextField autoFocus fullWidth label={lt('numberOfTracks')} type="number" value={firstCount} disabled={disabled}
            onChange={(event) => setFirstCount(event.target.value)} error={!validCount}
            helperText={lt('enterAWholeNumberFromTo', { p0: state.canonical.entries.length })}
            slotProps={{ htmlInput: { min: 1, max: state.canonical.entries.length, step: 1 } }} />
          {state.error && <Alert severity="error" sx={{ mt: 2 }}>{resolve(state.error)}</Alert>}
        </DialogContent>
        <DialogActions><Button disabled={busy} onClick={() => setRemoveFirstOpen(false)}>{lt('cancel')}</Button><Button type="submit" color="error" disabled={disabled || !validCount}>{lt('remove')}</Button></DialogActions>
      </Box>
    </Dialog>
  </>
}
