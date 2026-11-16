'use client'
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
  if (!response.ok) throw new Error(response.status === 409 ? 'Плейлист изменён. Обновите страницу перед сохранением.' : 'Не удалось выполнить действие. Обновите страницу и повторите.')
  return response.json()
}
function Editor({ initial, shared = false }: { initial: View; shared?: boolean }) {
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
    if (unavailable && !window.confirm(`Недоступных треков: ${unavailable}. Пропустить их и передать в очередь остальные?`)) return
    const entries = tracks.flatMap(track => track?.audio ? [createOccurrence(track)] : [])
    if (entries.length > 100 || (!replace && queue.canonical.entries.length + entries.length > 100)) { setError('Лимит очереди — 100. Освободите место: список не был обрезан.'); return }
    if (!entries.length) { setError('Нет доступных треков.'); return }
    if (replace && !entries.some(e => e.track?.audio)) { setError('Нет доступных треков для воспроизведения.'); return }
    if (replace && !window.confirm('Заменить текущую очередь этим плейлистом?')) return
    setBusy(true)
    try {
      if (!await store.dispatch({ type: replace ? 'replace' : 'append', entries })) throw new Error('Очередь не сохранена. Проверьте её состояние в плеере.')
      const first = entries.find(e => e.track?.audio)
      if (replace && first) player.selectEntry(first.entryId)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  function move(index: number, delta: number) {
    setIds(old => { const next = [...old]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next })
  }
  return <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
    {shared ? <Typography variant="h5">{name}</Typography> : <TextField label="Название" value={name} onChange={e => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />}
    <Typography>{view.visibility === 'private' ? 'Приватный' : 'Доступ по ссылке'} · {ids.length}/100</Typography>
    {ids.map((id, index) => <Stack key={`${id}-${index}`} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography>{index + 1}. {view.entries.find(e => e.trackId === id)?.track?.name ?? 'Недоступный трек'} ({id})</Typography>
      {!shared && <><Button disabled={busy || index === 0} aria-label={`Выше: ${index + 1}`} onClick={() => move(index, -1)}>↑</Button><Button disabled={busy || index === ids.length - 1} aria-label={`Ниже: ${index + 1}`} onClick={() => move(index, 1)}>↓</Button><Button disabled={busy} onClick={() => setIds(old => old.filter((_, i) => i !== index))}>Удалить</Button></>}
    </Stack>)}
    {!shared && <><TextField label="ID трека" value={newId} onChange={e => setNewId(e.target.value)} /><Button disabled={busy || ids.length >= 100 || !/^[a-f\d]{24}$/i.test(newId)} onClick={() => { setIds(old => [...old, newId.toLowerCase()]); setNewId('') }}>Добавить трек</Button><Button disabled={busy || queue.status !== 'ready'} onClick={() => setIds(queue.canonical.entries.map(e => e.trackId))}>Взять треки из очереди</Button><Button disabled={busy || !name.trim()} onClick={() => void save()}>Сохранить название и порядок</Button>
      <Button disabled={busy} onClick={() => void sharing('link')}>Создать / обновить ссылку</Button><Button disabled={busy} onClick={() => void sharing('private')}>Отозвать ссылку</Button>
      {link && <TextField label="Ссылка для чтения" value={link} slotProps={{ htmlInput: { readOnly: true } }} />}</>}
    <Typography variant="caption">В очередь передаётся сохранённый список. Пропуск недоступных треков требует подтверждения.</Typography>
    <Button disabled={busy || queue.status !== 'ready' || !ids.length || ids.join() !== view.entries.map(e => e.trackId).join()} onClick={() => void enqueue(true)}>Воспроизвести</Button>
    <Button disabled={busy || queue.status !== 'ready' || !ids.length || ids.join() !== view.entries.map(e => e.trackId).join()} onClick={() => void enqueue(false)}>Добавить в очередь</Button>
    {error && <Alert severity="error">{error}</Alert>}
  </Stack></Paper>
}
function Library({ identity }: { identity: string }) {
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
  return <Stack spacing={2} sx={{ p: 3 }}><Typography variant="h4">Мои плейлисты</Typography>
    <TextField label="Название нового плейлиста" value={name} onChange={e => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} /><Button disabled={busy || !name.trim()} onClick={() => void create()}>Создать приватный плейлист</Button>
    {items.map(item => <Button key={item.id} disabled={busy} onClick={() => void open(item.id)}>{selected?.id === item.id ? selected.name : item.name}</Button>)}
    {selected && <Editor key={`${selected.id}-${selected.revision}`} initial={selected} />}{error && <Alert severity="error">{error}</Alert>}
  </Stack>
}
export function Playlists() {
  const { user, confirmed } = useViewer()
  if (!confirmed) return <Typography>Проверяем сессию…</Typography>
  if (!user) return <Button component={Link} href="/login?returnTo=/playlists">Войти</Button>
  return <Library key={user.id} identity={user.id} />
}
export function SharedPlaylist({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null), [failed, setFailed] = useState(false)
  useEffect(() => { let active = true; api<View>(`/shared/${encodeURIComponent(token)}`).then(data => { if (active) setView(data) }).catch(() => { if (active) setFailed(true) }); return () => { active = false } }, [token])
  if (failed) return <Alert severity="error">Плейлист недоступен. Ссылка могла быть отозвана.</Alert>
  return view ? <Editor initial={view} shared /> : <Typography>Загрузка…</Typography>
}
