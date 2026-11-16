'use client'
import { useText, useMessage } from '@/i18n/LocaleProvider'
import { message as localMessage } from '@/i18n/messages'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material'
import { useViewer } from '@/features/auth/ViewerProvider'
import { useQueue, useQueueStore } from '@/features/queue/hooks'
import { createOccurrence } from '@/features/queue/commands'
import { usePlayer } from '@/features/player/PlayerProvider'
import type { components } from '@/lib/api/schema'
type View = components['schemas']['PlaylistView']
type List = components['schemas']['PlaylistList']
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/playlists${path}`, { method, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Gurach-Request': '1' }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!response.ok) throw new Error(response.status === 409 ? localMessage('thePlaylistHasChangedRefreshThePageBeforeSaving') : localMessage('couldNotCompleteTheActionRefreshThePageAnd'))
  return response.json()
}
function Editor({ initial, shared = false }: { initial: View; shared?: boolean }) {
  const resolve = useMessage()

  const lt = useText()

  const [view, setView] = useState(initial), [name, setName] = useState(initial.name)
  const [ids, setIds] = useState(initial.entries.map(e => e.trackId))
  const [newId, setNewId] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [link, setLink] = useState('')
  const store = useQueueStore(), queue = useQueue(), player = usePlayer()
  async function save() {
    setBusy(true); setError('')
    try { const saved = await api<View>(`/${view.id}`, 'PUT', { name, trackIds: ids, expectedRevision: view.revision }); setView(saved) }
    catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  async function sharing(visibility: 'private' | 'link') {
    setBusy(true); setError('')
    try {
      const result = await api<components['schemas']['PlaylistLink']>(`/${view.id}/sharing`, 'PUT', { visibility, expectedRevision: view.revision })
      setView(v => ({ ...v, visibility, revision: result.revision }))
      setLink(result.token ? `${location.origin}/playlists/shared/${result.token}` : '')
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  async function enqueue(replace: boolean) {
    setError('')
    const tracks = ids.map(id => view.entries.find(e => e.trackId === id)?.track)
    const unavailable = tracks.filter(track => !track?.audio).length
    if (unavailable && !window.confirm(lt('unavailableTracksSkipThemAndSendTheRemainingTracks', { p0: unavailable }))) return
    const entries = tracks.flatMap(track => track?.audio ? [createOccurrence(track)] : [])
    if (entries.length > 100 || (!replace && queue.canonical.entries.length + entries.length > 100)) { setError(localMessage('theQueueLimitIsFreeUpSpaceTheList')); return }
    if (!entries.length) { setError(localMessage('noAvailableTracks')); return }
    if (replace && !entries.some(e => e.track?.audio)) { setError(localMessage('noTracksAvailableForPlayback')); return }
    if (replace && !window.confirm(lt('replaceTheCurrentQueueWithThisPlaylist'))) return
    setBusy(true)
    try {
      if (!await store.dispatch({ type: replace ? 'replace' : 'append', entries })) throw new Error(localMessage('theQueueWasNotSavedCheckItsStateIn'))
      const first = entries.find(e => e.track?.audio)
      if (replace && first) player.selectEntry(first.entryId)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  function move(index: number, delta: number) {
    setIds(old => { const next = [...old]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next })
  }
  return <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
    {shared ? <Typography variant="h5">{name}</Typography> : <TextField label={lt('title')} value={name} onChange={e => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />}
    <Typography>{view.visibility === 'private' ? lt('private') : lt('anyoneWithTheLink')} · {ids.length}/100</Typography>
    {ids.map((id, index) => <Stack key={`${id}-${index}`} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography>{index + 1}. {view.entries.find(e => e.trackId === id)?.track?.name ?? lt('unavailableTrack')} ({id})</Typography>
      {!shared && <><Button disabled={busy || index === 0} aria-label={lt('moveUp', { p0: index + 1 })} onClick={() => move(index, -1)}>↑</Button><Button disabled={busy || index === ids.length - 1} aria-label={lt('moveDown', { p0: index + 1 })} onClick={() => move(index, 1)}>↓</Button><Button disabled={busy} onClick={() => setIds(old => old.filter((_, i) => i !== index))}>{lt('delete')}</Button></>}
    </Stack>)}
    {!shared && <><TextField label={lt('trackId')} value={newId} onChange={e => setNewId(e.target.value)} /><Button disabled={busy || ids.length >= 100 || !/^[a-f\d]{24}$/i.test(newId)} onClick={() => { setIds(old => [...old, newId.toLowerCase()]); setNewId('') }}>{lt('addTrack')}</Button><Button disabled={busy || queue.status !== 'ready'} onClick={() => setIds(queue.canonical.entries.map(e => e.trackId))}>{lt('useTracksFromQueue')}</Button><Button disabled={busy || !name.trim()} onClick={() => void save()}>{lt('saveTitleAndOrder')}</Button>
      <Button disabled={busy} onClick={() => void sharing('link')}>{lt('createRenewLink')}</Button><Button disabled={busy} onClick={() => void sharing('private')}>{lt('revokeLink')}</Button>
      {link && <TextField label={lt('readOnlyLink')} value={link} slotProps={{ htmlInput: { readOnly: true } }} />}</>}
    <Typography variant="caption">{lt('theSavedListWillBeSentToTheQueue')}</Typography>
    <Button disabled={busy || queue.status !== 'ready' || !ids.length || ids.join() !== view.entries.map(e => e.trackId).join()} onClick={() => void enqueue(true)}>{lt('play238')}</Button>
    <Button disabled={busy || queue.status !== 'ready' || !ids.length || ids.join() !== view.entries.map(e => e.trackId).join()} onClick={() => void enqueue(false)}>{lt('addToQueue')}</Button>
    {error && <Alert severity="error">{resolve(error)}</Alert>}
  </Stack></Paper>
}
function Library({ identity }: { identity: string }) {
  const resolve = useMessage()

  const lt = useText()

  const { isConfirmed } = useViewer()
  const [items, setItems] = useState<List['items']>([]), [selected, setSelected] = useState<View | null>(null)
  const [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { let active = true; api<List>('').then(data => { if (active && isConfirmed(identity)) setItems(data.items) }).catch(e => { if (active) setError(String(e)) }); return () => { active = false } }, [identity, isConfirmed])
  async function open(id: string) {
    setBusy(true); setError('')
    try { const view = await api<View>(`/${id}`); if (isConfirmed(identity)) setSelected(view) } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  async function create() {
    setBusy(true); setError('')
    try { const view = await api<View>('', 'POST', { name, trackIds: [] }); if (isConfirmed(identity)) { setItems(old => [{ id: view.id, name: view.name }, ...old]); setSelected(view); setName('') } } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  return <Stack spacing={2} sx={{ p: 3 }}><Typography variant="h4">{lt('myPlaylists')}</Typography>
    <TextField label={lt('newPlaylistTitle')} value={name} onChange={e => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} /><Button disabled={busy || !name.trim()} onClick={() => void create()}>{lt('createPrivatePlaylist')}</Button>
    {items.map(item => <Button key={item.id} disabled={busy} onClick={() => void open(item.id)}>{selected?.id === item.id ? selected.name : item.name}</Button>)}
    {selected && <Editor key={`${selected.id}-${selected.revision}`} initial={selected} />}{error && <Alert severity="error">{resolve(error)}</Alert>}
  </Stack>
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
