'use client'
import { useText, useMessage } from '@/i18n/LocaleProvider'
import { message as localMessage } from '@/i18n/messages'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { PlayerArtwork } from '@/features/player/PlayerArtwork'
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material'
import { useViewer } from '@/features/auth/ViewerProvider'
import { useQueue } from '@/features/queue/hooks'
import { createOccurrence } from '@/features/queue/commands'
import { usePlayer } from '@/features/player/PlayerProvider'
import type { components } from '@/lib/api/schema'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ActionFeedback } from '@/components/ui/ActionFeedback'
import { useQueueAction } from '@/features/queue/useQueueAction'
import type { QueueEntry } from '@/features/queue/types'
type View = components['schemas']['PlaylistView']
type List = components['schemas']['PlaylistList']
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/playlists${path}`, { method, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Gurach-Request': '1' }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!response.ok) throw new Error(response.status === 409 ? localMessage('thePlaylistHasChangedRefreshThePageBeforeSaving') : localMessage('couldNotCompleteTheActionRefreshThePageAnd'))
  return response.json()
}
function Editor({ initial, shared = false }: { initial: View; shared?: boolean }) {
  const lt = useText()

  const [view, setView] = useState(initial), [name, setName] = useState(initial.name)
  const [ids, setIds] = useState(initial.entries.map(e => e.trackId))
  const [newId, setNewId] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [link, setLink] = useState('')
  const queue = useQueue(), player = usePlayer()
  const queueAction = useQueueAction()
  const [confirmation, setConfirmation] = useState<{ entries: QueueEntry[]; replace: boolean; unavailable: number; revision: number } | null>(null)
  const [success, setSuccess] = useState('')
  const [feedbackTarget, setFeedbackTarget] = useState<'save' | 'sharing' | 'queue'>('save')
  async function save() {
    setBusy(true); setError(''); setSuccess(''); setFeedbackTarget('save'); queueAction.reset()
    try { const saved = await api<View>(`/${view.id}`, 'PUT', { name, trackIds: ids, expectedRevision: view.revision }); setView(saved); setSuccess(localMessage('playlistSaved')) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  async function sharing(visibility: 'private' | 'link') {
    setBusy(true); setError(''); setSuccess(''); setFeedbackTarget('sharing'); queueAction.reset()
    try {
      const result = await api<components['schemas']['PlaylistLink']>(`/${view.id}/sharing`, 'PUT', { visibility, expectedRevision: view.revision })
      setView(v => ({ ...v, visibility, revision: result.revision }))
      setLink(result.token ? `${location.origin}/playlists/shared/${result.token}` : '')
      setSuccess(localMessage(visibility === 'link' ? 'playlistLinkCreated' : 'playlistLinkRevoked'))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  async function enqueue(replace: boolean) {
    setError(''); setSuccess(''); setFeedbackTarget('queue'); queueAction.reset()
    const tracks = ids.map(id => view.entries.find(e => e.trackId === id)?.track)
    const unavailable = tracks.filter(track => !track?.audio).length
    const entries = tracks.flatMap(track => track?.audio ? [createOccurrence(track)] : [])
    if (entries.length > 100 || (!replace && queue.canonical.entries.length + entries.length > 100)) { setError(localMessage('theQueueLimitIsFreeUpSpaceTheList')); return }
    if (!entries.length) { setError(localMessage('noAvailableTracks')); return }
    if (replace && !entries.some(e => e.track?.audio)) { setError(localMessage('noTracksAvailableForPlayback')); return }
    if (unavailable || replace) {
      setConfirmation({ entries, replace, unavailable, revision: queue.canonical.revision })
      return
    }
    await sendToQueue(entries, replace)
  }
  async function sendToQueue(entries: QueueEntry[], replace: boolean, revision?: number) {
    setBusy(true)
    try {
      if (!await queueAction.run({ type: replace ? 'replace' : 'append', entries }, localMessage('queueUpdated'), revision)) return
      setConfirmation(null)
      const first = entries.find(e => e.track?.audio)
      if (replace && first) player.selectEntry(first.entryId)
    } finally { setBusy(false) }
  }
  function move(index: number, delta: number) {
    setIds(old => { const next = [...old]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next })
  }
  return <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 'var(--wae-radius-panel)' }}><Stack spacing={3} aria-busy={busy}>
    {shared ? <PageHeader title={name} /> : <TextField label={lt('title')} value={name} disabled={busy} onChange={e => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />}
    <Typography color="text.secondary">{view.visibility === 'private' ? lt('private') : lt('anyoneWithTheLink')} · {ids.length}/100</Typography>
    <Stack spacing={0}>
    {ids.map((id, index) => {
      const entry = view.entries.find(e => e.trackId === id)
      return <Box key={`${id}-${index}`} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid', borderColor: 'divider', py: 1.5, gap: 1 }}>
        <Box sx={{ width: 44, height: 44, overflow: 'hidden', borderRadius: 'var(--wae-radius-artwork)', flexShrink: 0 }}><PlayerArtwork picture={entry?.track?.picture} name="" size={44} loading="lazy" /></Box>
        <Box sx={{ minWidth: 0, flex: '1 1 160px', overflowWrap: 'anywhere' }}>
          <Typography sx={{ fontWeight: 500 }}>{index + 1}. {entry ? entry.track?.name ?? lt('unavailableTrack') : lt('trackId')}</Typography>
          <Typography variant="body2" color="text.secondary">{entry?.track?.artist}</Typography>
          {!shared && <Typography variant="caption" color="text.secondary" sx={{ userSelect: 'all' }}>{id}</Typography>}
        </Box>
        {!shared && <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: .5 }}>
          <Button disabled={busy || index === 0} aria-label={lt('moveUp', { p0: index + 1 })} onClick={() => move(index, -1)}>↑</Button>
          <Button disabled={busy || index === ids.length - 1} aria-label={lt('moveDown', { p0: index + 1 })} onClick={() => move(index, 1)}>↓</Button>
          <Button disabled={busy} onClick={() => setIds(old => old.filter((_, i) => i !== index))}>{lt('delete')}</Button>
        </Stack>}
      </Box>
    })}
    </Stack>
    {!shared && <>
      <Box component="details"><Typography component="summary" sx={{ cursor: 'pointer', minHeight: 44, py: 1 }}>{lt('trackId')}</Typography>
        <Stack spacing={1} sx={{ mt: 1 }}><TextField label={lt('trackId')} value={newId} disabled={busy} onChange={e => setNewId(e.target.value)} />
        <Button disabled={busy || ids.length >= 100 || !/^[a-f\d]{24}$/i.test(newId)} onClick={() => { setIds(old => [...old, newId.toLowerCase()]); setNewId('') }}>{lt('addTrack')}</Button></Stack>
      </Box>
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button variant="outlined" disabled={busy || queue.status !== 'ready'} onClick={() => setIds(queue.canonical.entries.map(e => e.trackId))}>{lt('useTracksFromQueue')}</Button>
        <Button variant="contained" disabled={busy || !name.trim()} onClick={() => void save()}>{lt('saveTitleAndOrder')}</Button>
      </Stack>
      {feedbackTarget === 'save' && <ActionFeedback error={error} success={success} />}
      <Stack spacing={1} sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}><Button disabled={busy} onClick={() => void sharing('link')}>{lt('createRenewLink')}</Button><Button disabled={busy} onClick={() => void sharing('private')}>{lt('revokeLink')}</Button></Stack>
        {link && <TextField label={lt('readOnlyLink')} value={link} slotProps={{ htmlInput: { readOnly: true } }} />}
        {feedbackTarget === 'sharing' && <ActionFeedback error={error} success={success} />}
      </Stack>
    </>}
    <Stack spacing={1} sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography variant="caption">{lt('theSavedListWillBeSentToTheQueue')}</Typography>
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button variant={shared ? 'contained' : 'outlined'} disabled={busy || queue.status !== 'ready' || !ids.length || ids.join() !== view.entries.map(e => e.trackId).join()} onClick={() => void enqueue(true)}>{lt('play238')}</Button>
        <Button disabled={busy || queue.status !== 'ready' || !ids.length || ids.join() !== view.entries.map(e => e.trackId).join()} onClick={() => void enqueue(false)}>{lt('addToQueue')}</Button>
      </Stack>
      {!confirmation && <ActionFeedback {...queueAction.feedback} />}
      {feedbackTarget === 'queue' && <ActionFeedback error={error} />}
    </Stack>
    <ConfirmDialog open={Boolean(confirmation)} title={lt(confirmation?.replace ? 'replaceTheCurrentQueueWithThisPlaylist' : 'addToQueue')}
      confirmLabel={lt('confirm')} busy={busy} disabled={queue.status !== 'ready'} destructive={confirmation?.replace}
      onClose={() => setConfirmation(null)} onConfirm={() => { if (confirmation) void sendToQueue(confirmation.entries, confirmation.replace, confirmation.revision) }}>
      {Boolean(confirmation?.unavailable) && <Typography>{lt('unavailableTracksSkipThemAndSendTheRemainingTracks', { p0: confirmation?.unavailable ?? 0 })}</Typography>}
      {confirmation?.replace && <Typography>{lt('replaceTheCurrentQueueWithThisPlaylist')}</Typography>}
      <ActionFeedback {...queueAction.feedback} />
    </ConfirmDialog>
  </Stack></Paper>

}
function Library({ identity }: { identity: string }) {
  const resolve = useMessage()

  const lt = useText()

  const { isConfirmed } = useViewer()
  const [items, setItems] = useState<List['items']>([]), [selected, setSelected] = useState<View | null>(null)
  const [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { let active = true; api<List>('').then(data => { if (active && isConfirmed(identity)) { setItems(data.items); setLoaded(true) } }).catch(e => { if (active) setError(String(e)) }); return () => { active = false } }, [identity, isConfirmed])
  async function open(id: string) {
    setBusy(true); setError('')
    try { const view = await api<View>(`/${id}`); if (isConfirmed(identity)) setSelected(view) } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  async function create() {
    setBusy(true); setError('')
    try { const view = await api<View>('', 'POST', { name, trackIds: [] }); if (isConfirmed(identity)) { setItems(old => [{ id: view.id, name: view.name }, ...old]); setSelected(view); setName('') } } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  return <Box>
    <PageHeader title={lt('myPlaylists')} />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '280px minmax(0, 1fr)' }, gap: 4, alignItems: 'start' }}>
     <Stack spacing={2} sx={{ minWidth: 0 }}>
      <TextField label={lt('newPlaylistTitle')} value={name} onChange={e => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
      <Button variant="contained" disabled={busy || !name.trim()} onClick={() => void create()}>{lt('createPrivatePlaylist')}</Button>
      {!loaded && !error && <Typography role="status">{lt('playlistLoading')}</Typography>}
      {loaded && !items.length && <Typography color="text.secondary">{lt('playlistsEmpty')}</Typography>}
      {items.map(item => <Button key={item.id} disabled={busy} aria-pressed={selected?.id === item.id} sx={{ justifyContent: 'flex-start', overflowWrap: 'anywhere', bgcolor: selected?.id === item.id ? 'action.selected' : undefined }} onClick={() => void open(item.id)}>{selected?.id === item.id ? selected.name : item.name}</Button>)}
     </Stack>
     <Box sx={{ minWidth: 0 }}>{selected && <Editor key={`${selected.id}-${selected.revision}`} initial={selected} />}</Box>
    </Box>
    {error && <Alert severity="error" sx={{ mt: 2 }}>{resolve(error)}</Alert>}
  </Box>

}
export function Playlists() {
  const lt = useText()

  const { user, confirmed } = useViewer()
  if (!confirmed) return <Typography>{lt('checkingSession')}</Typography>
  if (!user) return <Button component={Link} href="/login?returnTo=/playlists">{lt('signIn')}</Button>
  return <Library key={user.id} identity={user.id} />
}
export function SharedPlaylist({ token }: { token: string }) {
  const lt = useText()

  const [view, setView] = useState<View | null>(null), [failed, setFailed] = useState(false)
  useEffect(() => { let active = true; api<View>(`/shared/${encodeURIComponent(token)}`).then(data => { if (active) setView(data) }).catch(() => { if (active) setFailed(true) }); return () => { active = false } }, [token])
  if (failed) return <Alert severity="error">{lt('playlistUnavailableTheLinkMayHaveBeenRevoked')}</Alert>
  return view ? <Editor initial={view} shared /> : <Typography>{lt('loading162')}</Typography>
}
