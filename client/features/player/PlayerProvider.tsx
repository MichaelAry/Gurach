'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import type { QueueEntry } from '@/features/queue/types'
import type { PlayableTrack } from '@/features/tracks/types'
import { useRecordListen } from '@/features/tracks/components/ListenCountsProvider'
import { useViewer } from '@/features/auth/ViewerProvider'
import { QueueProvider } from '@/features/queue/QueueProvider'
import { useQueue, useQueueStore } from '@/features/queue/hooks'
import { accountQueueAdapter } from '@/features/queue/adapters'
import { guestQueueAdapter, guestQueuePersistenceAvailable, INVALID_GUEST_QUEUE_WARNING } from '@/features/queue/guestAdapter'
import { createOccurrence } from '@/features/queue/commands'
import { acquireGuestAudioLease, releaseGuestAudioLease } from './guestAudioLease'
import { GuestQueueImport } from '@/features/queue/components/GuestQueueImport'
import { ListenProgress } from './listenProgress'
import { cacheAudioAhead, prepareAudioCache } from './audioCache'
interface Transport {
  current: PlayableTrack | null; queue: PlayableTrack[]; playing: boolean
  selectedEntryId: string | null; position: number; count: number; pending: boolean; error: string | null
  audioError: string | null; retrying: boolean; retryAudio: () => void; oneOff: boolean
  play: (track: PlayableTrack) => void
  selectEntry: (id: string) => void; restore: (id: string, time: number) => void
  toggle: () => void; next: () => void; prev: () => void; seek: (time: number) => void
}
const TransportContext = createContext<Transport | null>(null)
const ProgressContext = createContext({ currentTime: 0, duration: 0 })
type SavedPlayback = { version: 1; selectedEntryId: string | null; position: number }
function playbackKey(identity: string) { return `gurach:playback:${identity}` }
function readPlayback(identity: string): SavedPlayback | null {
  try {
    const value = JSON.parse(localStorage.getItem(playbackKey(identity)) ?? 'null') as SavedPlayback | null
    if (!value || value.version !== 1 || (value.selectedEntryId !== null && !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value.selectedEntryId)) ||
      !Number.isFinite(value.position) || value.position < 0) return null
    return value
  } catch { return null }
}
export function usePlayerTransport() { const value = useContext(TransportContext); if (!value) throw new Error('PlayerProvider required'); return value }
export function usePlayerProgress() { return useContext(ProgressContext) }
export function usePlayer() { return { ...usePlayerTransport(), ...usePlayerProgress() } }
export function PlayerProvider({ children }: { children: ReactNode }) {
  const viewer = useViewer()
  const identity = viewer.resolved ? viewer.user?.id ?? 'guest' : 'loading'
  const isConfirmed = viewer.isConfirmed
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const adapter = useMemo(() => identity === 'guest' || identity === 'loading'
    ? guestQueueAdapter({ onStatus: ({ warning }) => setStorageWarning(warning) }) : accountQueueAdapter(() => isConfirmed(identity)), [identity, isConfirmed])
  useEffect(() => {
    if (identity !== 'guest') return
    const timer = window.setTimeout(() => {
      try { if (localStorage.getItem('gurach:guest-queue:invalid') !== null) setStorageWarning(INVALID_GUEST_QUEUE_WARNING) } catch { /* Adapter reports unavailable storage. */ }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [identity])
  return <QueueProvider adapter={adapter}><AudioPlayer identity={identity} storageWarning={storageWarning} enabled={viewer.resolved}>
    {viewer.user && <GuestQueueImport userId={viewer.user.id} />}{children}
  </AudioPlayer></QueueProvider>
}
function AudioPlayer({ children, enabled, identity, storageWarning }: { children: ReactNode; enabled: boolean; identity: string; storageWarning: string | null }) {
  const store = useQueueStore(), state = useQueue()
  const viewer = useViewer()
  const { isConfirmed } = viewer
  const mounted = useRef(false), actionEpoch = useRef(0), retryInFlight = useRef(false)
  const [oneOffEntry, setOneOffEntry] = useState<QueueEntry | null>(null)
  const [fullQueueEntry, setFullQueueEntry] = useState<QueueEntry | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null), source = useRef<string | null>(null)
  const activeIdentity = useRef(identity)
  const restoredIdentity = useRef<string | null>(null)
  const playbackToPersist = useRef<SavedPlayback | null>(null)
  const lastPersistAt = useRef(0)
  const lastCacheAt = useRef(0)
  const session = useRef(0), counted = useRef<number | null>(null), intent = useRef<boolean | null>(null), savedTime = useRef<number | null>(null)
  const listenProgress = useRef(new ListenProgress()), advancing = useRef(false), playbackId = useRef<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [transportError, setTransportError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ currentTime: 0, duration: 0 })
  const recordListen = useRecordListen()
  const selected = state.canonical.entries.find((entry) => entry.entryId === state.selectedEntryId)
  const current = oneOffEntry?.track ?? (selected?.availability === 'playable' ? selected.track : null)
  const playbackEntryId = oneOffEntry?.entryId ?? state.selectedEntryId
  useEffect(() => { void prepareAudioCache() }, [])
  useEffect(() => {
    mounted.current = true; actionEpoch.current++
    const audio = audioRef.current
    return () => { mounted.current = false; audio?.pause(); releaseGuestAudioLease() }
  }, [])
  useEffect(() => {
    if (viewer.confirmed && identity !== 'loading' && store.getSnapshot().status === 'error' && !store.hasPendingMutation()) void store.refresh()
  }, [viewer.confirmed, identity, store])
  const playAudio = useCallback(async () => {
    const audio = audioRef.current, active = session.current, key = source.current
    if (!audio) return
    try { await audio.play() } catch (error) {
      if (!mounted.current || session.current !== active || source.current !== key || (error instanceof DOMException && error.name === 'AbortError')) return
      audio.pause(); setPlaying(false); setRetrying(false); retryInFlight.current = false
      setAudioError('Не удалось запустить аудио. Проверьте соединение и нажмите «Повторить аудио».')
      if (identity === 'guest') releaseGuestAudioLease()
    }
  }, [identity])
  const resumeCurrent = useCallback(async (reload = false) => {
    const audio = audioRef.current, key = source.current
    if (!enabled || !audio || !key || retryInFlight.current) return
    const epoch = ++actionEpoch.current
    const valid = () => mounted.current && actionEpoch.current === epoch && source.current === key
    if (identity === 'guest' && !await acquireGuestAudioLease(valid)) {
      if (valid()) setTransportError('Плеер уже работает в другой вкладке. Остановите его там и повторите запуск.')
      return
    }
    if (!valid()) return
    setTransportError(null); setAudioError(null)
    if (reload || audio.error) {
      savedTime.current ??= Number.isFinite(audio.currentTime) ? audio.currentTime : 0
      advancing.current = false; listenProgress.current.suspend()
      retryInFlight.current = true; setRetrying(true)
      // Same occurrence and playback ID: reloading is a transport retry, not a new listen.
      audio.load()
    }
    await playAudio()
    if (valid()) { retryInFlight.current = false; setRetrying(false) }
  }, [enabled, identity, playAudio])
  const retryAudio = useCallback(() => { void resumeCurrent(true) }, [resumeCurrent])
  useEffect(() => {
    if (activeIdentity.current === identity) return
    activeIdentity.current = identity
    restoredIdentity.current = null
    const audio = audioRef.current
    audio?.pause(); audio?.removeAttribute('src'); audio?.load()
    actionEpoch.current++; retryInFlight.current = false
    setOneOffEntry(null); setFullQueueEntry(null); setAudioError(null); setRetrying(false)
    source.current = null; intent.current = null; savedTime.current = null; counted.current = null
    session.current++; listenProgress.current = new ListenProgress(); playbackId.current = null; advancing.current = false
    setPlaying(false); setProgress({ currentTime: 0, duration: 0 }); setTransportError(null)
    releaseGuestAudioLease()
  }, [identity])
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (!enabled || !current?.audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); source.current = null; if (identity === 'guest') releaseGuestAudioLease(); return }
    if (source.current === playbackEntryId) return
    const resume = intent.current ?? !audio.paused
    intent.current = null
    audio.pause(); source.current = playbackEntryId; session.current++; lastCacheAt.current = 0
    counted.current = null
    setAudioError(null); setTransportError(null); retryInFlight.current = false; setRetrying(false)
    listenProgress.current = new ListenProgress(); playbackId.current = null; advancing.current = false
    audio.src = current.audio; audio.currentTime = 0; audio.load()
    if (resume) void playAudio()
  }, [playbackEntryId, current?.audio, enabled, identity, playAudio])
  const selectEntry = useCallback((id: string) => {
    const audio = audioRef.current, snapshot = store.getSnapshot()
    if (!enabled || snapshot.status === 'pending' || !snapshot.canonical.entries.some((entry) => entry.entryId === id && entry.availability === 'playable' && entry.track?.audio)) return
    if (source.current === id) {
      if (audio?.paused || audio?.error) void resumeCurrent()
      else { audio?.pause(); if (identity === 'guest') releaseGuestAudioLease() }
      return
    }
    const epoch = ++actionEpoch.current
    const valid = () => mounted.current && actionEpoch.current === epoch
    void (async () => {
      if (identity === 'guest' && !await acquireGuestAudioLease(valid)) {
        if (valid()) setTransportError('Плеер уже работает в другой вкладке. Остановите его там и повторите запуск.')
        return
      }
      if (!valid()) return
      setTransportError(null); intent.current = true; savedTime.current = null
      if (store.select(id)) setOneOffEntry(null)
      else { intent.current = null; if (identity === 'guest' && audio?.paused) releaseGuestAudioLease() }
    })()
  }, [enabled, identity, store, resumeCurrent])
  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (audio && !audio.paused) { actionEpoch.current++; retryInFlight.current = false; setRetrying(false); audio.pause(); if (identity === 'guest') releaseGuestAudioLease() }
    else void resumeCurrent()
  }, [identity, resumeCurrent])
  const play = useCallback((track: PlayableTrack) => {
    if (!enabled || !track.audio) return
    if (oneOffEntry?.trackId === track._id) { toggle(); return }
    const snapshot = store.getSnapshot()
    const existing = snapshot.canonical.entries.find((entry) => entry.entryId === snapshot.selectedEntryId && entry.trackId === track._id && entry.availability === 'playable') ?? snapshot.canonical.entries.find((entry) => entry.trackId === track._id && entry.availability === 'playable')
    if (existing) { selectEntry(existing.entryId); return }
    const occurrence = createOccurrence(track)
    if (snapshot.canonical.entries.length >= snapshot.canonical.capacity) { setFullQueueEntry(occurrence); return }
    if (identity !== 'guest' && !isConfirmed(identity)) { setTransportError('Сессия временно не подтверждена. Проверьте сессию перед изменением очереди.'); return }
    const epoch = ++actionEpoch.current
    void store.dispatch({ type: 'append', entries: [occurrence] }).then((ok) => {
      if (!mounted.current || epoch !== actionEpoch.current) return
      if (ok) selectEntry(occurrence.entryId)
      else if (store.getSnapshot().error === 'QUEUE_FULL' || (!store.hasPendingMutation() && store.getSnapshot().canonical.entries.length >= store.getSnapshot().canonical.capacity)) setFullQueueEntry(occurrence)
      else setTransportError('Не удалось добавить трек. Откройте очередь и повторите сохранение или загрузку. ' + (store.getSnapshot().error ?? ''))
    })
  }, [enabled, identity, isConfirmed, store, selectEntry, oneOffEntry?.trackId, toggle])
  const playOnce = useCallback(() => {
    if (!enabled || !fullQueueEntry?.track?.audio) return
    const entry = fullQueueEntry, epoch = ++actionEpoch.current
    const valid = () => mounted.current && actionEpoch.current === epoch
    void (async () => {
      if (identity === 'guest' && !await acquireGuestAudioLease(valid)) {
        if (valid()) setTransportError('Плеер уже работает в другой вкладке. Остановите его там и повторите запуск.')
        setFullQueueEntry(null)
        return
      }
      if (!valid()) return
      intent.current = true; savedTime.current = null
      setOneOffEntry(entry); setFullQueueEntry(null)
    })()
  }, [enabled, fullQueueEntry, identity])
  const step = useCallback((delta: number) => {
    if (oneOffEntry) { audioRef.current?.pause(); if (identity === 'guest') releaseGuestAudioLease(); return }
    const snapshot = store.getSnapshot(), entries = snapshot.canonical.entries
    const index = entries.findIndex((entry) => entry.entryId === snapshot.selectedEntryId)
    if (index < 0) return
    for (let i = index + delta; i >= 0 && i < entries.length; i += delta) {
      if (entries[i].availability === 'playable' && entries[i].track?.audio) { selectEntry(entries[i].entryId); return }
    }
    audioRef.current?.pause(); if (identity === 'guest') releaseGuestAudioLease()
  }, [identity, store, selectEntry, oneOffEntry])
  const next = useCallback(() => step(1), [step])
  const prev = useCallback(() => { if ((audioRef.current?.currentTime ?? 0) > 3) audioRef.current!.currentTime = 0; else step(-1) }, [step])
  const seek = useCallback((time: number) => { const audio = audioRef.current; if (audio && Number.isFinite(time) && Number.isFinite(audio.duration)) audio.currentTime = Math.min(Math.max(0, time), audio.duration) }, [])
  const restore = useCallback((id: string, time: number) => {
    setOneOffEntry(null); audioRef.current?.pause(); intent.current = false; savedTime.current = Number.isFinite(time) ? Math.max(0, time) : 0
    if (!store.select(id)) { intent.current = null; savedTime.current = null }
  }, [store])
  useEffect(() => {
    if (!enabled || state.status !== 'ready' || identity === 'loading' || restoredIdentity.current === identity) return
    if (identity === 'guest' && !guestQueuePersistenceAvailable()) return
    const saved = readPlayback(identity)
    if (saved?.selectedEntryId && state.canonical.entries.some((entry) => entry.entryId === saved.selectedEntryId && entry.availability === 'playable' && entry.track?.audio)) {
      const timer = window.setTimeout(() => { restoredIdentity.current = identity; restore(saved.selectedEntryId!, saved.position) }, 0)
      return () => window.clearTimeout(timer)
    }
    restoredIdentity.current = identity
  }, [enabled, identity, restore, state.status, state.canonical.entries])
  useEffect(() => {
    if (oneOffEntry) return
    playbackToPersist.current = { version: 1, selectedEntryId: state.selectedEntryId, position: Number.isFinite(progress.currentTime) ? Math.max(0, progress.currentTime) : 0 }
  }, [state.selectedEntryId, progress.currentTime, oneOffEntry])
  useEffect(() => {
    if (oneOffEntry || !enabled || state.status !== 'ready' || identity === 'loading' || (identity === 'guest' && !guestQueuePersistenceAvailable())) return
    const timer = window.setTimeout(() => {
      if (identity !== 'guest' && !isConfirmed(identity)) return
      try { localStorage.setItem(playbackKey(identity), JSON.stringify(playbackToPersist.current)); lastPersistAt.current = Date.now() } catch { /* Playback resume is optional when storage is unavailable. */ }
    }, lastPersistAt.current ? Math.max(0, 1000 - (Date.now() - lastPersistAt.current)) : 0)
    return () => window.clearTimeout(timer)
  }, [enabled, identity, state.status, state.selectedEntryId, progress.currentTime, oneOffEntry, isConfirmed])
  useEffect(() => {
    const save = () => {
      if (identity === 'loading' || (identity !== 'guest' && !isConfirmed(identity)) || (identity === 'guest' && !guestQueuePersistenceAvailable())) return
      const audio = audioRef.current
      const playback = playbackToPersist.current
      if (!playback || source.current !== playback.selectedEntryId) return
      const position = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : playback.position
      try { localStorage.setItem(playbackKey(identity), JSON.stringify({ ...playback, position })) } catch { /* Optional resume state. */ }
    }
    const hidden = () => { if (document.visibilityState === 'hidden') save() }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', hidden)
    return () => { window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', hidden) }
  }, [identity, isConfirmed])
  const value = useMemo<Transport>(() => ({ current, queue: state.canonical.entries.flatMap((entry) => entry.track ? [entry.track] : []), playing,
    selectedEntryId: playbackEntryId, position: oneOffEntry ? 0 : state.canonical.entries.findIndex((entry) => entry.entryId === state.selectedEntryId) + 1,
    count: state.canonical.entries.length, pending: state.status === 'pending' || state.status === 'loading', error: audioError ?? transportError ?? (viewer.error ? 'Сессия временно не подтверждена. Текущий звук сохранён; новые приватные операции недоступны.' : null) ?? storageWarning ?? state.error,
    audioError, retryAudio, retrying, oneOff: Boolean(oneOffEntry),
    play, selectEntry, restore, toggle, next, prev, seek }), [current, state, playing, playbackEntryId, oneOffEntry, audioError, retryAudio, retrying, transportError, viewer.error, storageWarning, play, selectEntry, restore, toggle, next, prev, seek])
  function collectListen() {
    const audio = audioRef.current
    if (!audio || !current || !enabled || !advancing.current || audio.seeking || source.current !== playbackEntryId) return
    listenProgress.current.sample(audio.currentTime, performance.now(), audio.playbackRate)
    if (!listenProgress.current.qualifies(audio.duration) || counted.current === session.current || !isConfirmed(identity === 'guest' ? null : identity)) return
    const active = session.current
    counted.current = active
    playbackId.current ??= crypto.randomUUID()
    void recordListen(current._id, playbackId.current).then((ok) => { if (!ok && counted.current === active) counted.current = null })
  }
  function suspendListen() {
    collectListen()
    advancing.current = false
    listenProgress.current.suspend()
  }
  function warmAudio(force = false) {
    const audio = audioRef.current
    if (!audio || !current?.audio || !enabled || source.current !== playbackEntryId) return
    if (!force && Date.now() - lastCacheAt.current < 1000) return
    lastCacheAt.current = Date.now()
    cacheAudioAhead(current.audio, audio.currentTime, audio.duration)
  }
  return <TransportContext.Provider value={value}><ProgressContext.Provider value={progress}>{children}
    <audio ref={audioRef} preload="metadata" onPlay={() => setPlaying(true)}
    onPlaying={() => { advancing.current = true; listenProgress.current.suspend(); collectListen() }}
    onWaiting={suspendListen}
    onSeeking={() => { advancing.current = false; listenProgress.current.suspend() }}
    onSeeked={() => { advancing.current = !audioRef.current?.paused; collectListen(); warmAudio(true) }}
    onPause={() => { suspendListen(); setPlaying(false); warmAudio(true) }}
    onError={() => {
      if (!source.current) return
      suspendListen(); audioRef.current?.pause(); setPlaying(false); retryInFlight.current = false; setRetrying(false)
      const code = audioRef.current?.error?.code
      setAudioError(code === 3 || code === 4 ? 'Не удалось декодировать аудио или формат недоступен. Нажмите «Повторить аудио» или выберите другой трек.' : 'Не удалось загрузить аудио. Проверьте соединение и нажмите «Повторить аудио».')
      if (identity === 'guest') releaseGuestAudioLease()
    }}
    onEnded={() => { suspendListen(); setPlaying(false); session.current++; listenProgress.current = new ListenProgress(); playbackId.current = null; if (!oneOffEntry) next(); else if (identity === 'guest') releaseGuestAudioLease() }}
    onEmptied={() => setProgress({ currentTime: 0, duration: 0 })}
    onTimeUpdate={() => { collectListen(); if (!audioRef.current?.paused) warmAudio(); setProgress((old) => ({ ...old, currentTime: audioRef.current?.currentTime ?? 0 })) }}
    onLoadedMetadata={() => { const audio = audioRef.current!; if (savedTime.current !== null && Number.isFinite(audio.duration)) { audio.currentTime = Math.min(savedTime.current, audio.duration); savedTime.current = null }; warmAudio(true); setProgress({ currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 }) }} />
    <Dialog open={Boolean(fullQueueEntry)} onClose={() => setFullQueueEntry(null)} fullWidth maxWidth="sm" aria-labelledby="player-full-queue-title">
      <DialogTitle id="player-full-queue-title">Очередь заполнена</DialogTitle>
      <DialogContent><Typography>В очереди уже {state.canonical.entries.length} треков. Можно послушать «{fullQueueEntry?.display.name}» один раз без добавления. Чтобы освободить место, закройте это окно и откройте «Очередь» в плеере: выберите вхождения для удаления. Ничего не будет удалено автоматически.</Typography></DialogContent>
      <DialogActions><Button onClick={() => setFullQueueEntry(null)}>Отмена</Button><Button onClick={playOnce}>Слушать один раз</Button></DialogActions>
    </Dialog>
  </ProgressContext.Provider></TransportContext.Provider>
}
