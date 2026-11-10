'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  const identity = viewer.loading ? 'loading' : viewer.user?.id ?? 'guest'
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const adapter = useMemo(() => identity === 'guest' || identity === 'loading'
    ? guestQueueAdapter({ onStatus: ({ warning }) => setStorageWarning(warning) }) : accountQueueAdapter(), [identity])
  useEffect(() => {
    if (identity !== 'guest') return
    const timer = window.setTimeout(() => {
      try { if (localStorage.getItem('gurach:guest-queue:invalid') !== null) setStorageWarning(INVALID_GUEST_QUEUE_WARNING) } catch { /* Adapter reports unavailable storage. */ }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [identity])
  return <QueueProvider adapter={adapter}><AudioPlayer identity={identity} storageWarning={storageWarning} enabled={!viewer.loading && !viewer.error}>
    {viewer.user && <GuestQueueImport userId={viewer.user.id} />}{children}
  </AudioPlayer></QueueProvider>
}
function AudioPlayer({ children, enabled, identity, storageWarning }: { children: ReactNode; enabled: boolean; identity: string; storageWarning: string | null }) {
  const store = useQueueStore(), state = useQueue()
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
  const current = selected?.availability === 'playable' ? selected.track : null
  useEffect(() => { void prepareAudioCache() }, [])
  useEffect(() => () => releaseGuestAudioLease(), [])
  useEffect(() => {
    if (activeIdentity.current === identity) return
    activeIdentity.current = identity
    restoredIdentity.current = null
    const audio = audioRef.current
    audio?.pause(); audio?.removeAttribute('src'); audio?.load()
    source.current = null; intent.current = null; savedTime.current = null; counted.current = null
    session.current++; listenProgress.current = new ListenProgress(); playbackId.current = null; advancing.current = false
    setPlaying(false); setProgress({ currentTime: 0, duration: 0 }); setTransportError(null)
    releaseGuestAudioLease()
  }, [identity])
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (!enabled || !current?.audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); source.current = null; if (identity === 'guest') releaseGuestAudioLease(); return }
    if (source.current === state.selectedEntryId) return
    const resume = intent.current ?? !audio.paused
    intent.current = null
    audio.pause(); source.current = state.selectedEntryId; session.current++; lastCacheAt.current = 0
    listenProgress.current = new ListenProgress(); playbackId.current = null; advancing.current = false
    audio.src = current.audio; audio.currentTime = 0; audio.load()
    if (resume) void audio.play().catch(() => setPlaying(false))
  }, [state.selectedEntryId, current?.audio, enabled, identity])
  const selectEntry = useCallback((id: string) => {
    const audio = audioRef.current
    if (!enabled || store.getSnapshot().status === 'pending') return
    if (store.getSnapshot().selectedEntryId === id) {
      if (audio?.paused) void (async () => {
        if (identity === 'guest' && !await acquireGuestAudioLease()) { setTransportError('Плеер уже работает в другой вкладке. Остановите его там и повторите запуск.'); return }
        setTransportError(null); await audio.play().catch(() => setPlaying(false))
      })(); else audio?.pause()
      return
    }
    void (async () => {
      if (identity === 'guest' && !await acquireGuestAudioLease()) { setTransportError('Плеер уже работает в другой вкладке. Остановите его там и повторите запуск.'); return }
      setTransportError(null); intent.current = true
      if (!store.select(id)) { intent.current = null; if (identity === 'guest') releaseGuestAudioLease() }
    })()
  }, [enabled, identity, store])
  const toggle = useCallback(() => {
    const id = store.getSnapshot().selectedEntryId, audio = audioRef.current
    if (!id) return
    if (audio && !audio.paused) { audio.pause(); if (identity === 'guest') releaseGuestAudioLease() }
    else selectEntry(id)
  }, [identity, store, selectEntry])
  const play = useCallback((track: PlayableTrack) => {
    if (!enabled || !track.audio) return
    const snapshot = store.getSnapshot()
    const existing = snapshot.canonical.entries.find((entry) => entry.entryId === snapshot.selectedEntryId && entry.trackId === track._id && entry.availability === 'playable') ?? snapshot.canonical.entries.find((entry) => entry.trackId === track._id && entry.availability === 'playable')
    if (existing) { selectEntry(existing.entryId); return }
    const occurrence = createOccurrence(track)
    void store.dispatch({ type: 'append', entries: [occurrence] }).then((ok) => { if (ok) selectEntry(occurrence.entryId) })
  }, [enabled, store, selectEntry])
  const step = useCallback((delta: number) => {
    const snapshot = store.getSnapshot(), entries = snapshot.canonical.entries
    const index = entries.findIndex((entry) => entry.entryId === snapshot.selectedEntryId)
    if (index < 0) return
    for (let i = index + delta; i >= 0 && i < entries.length; i += delta) {
      if (entries[i].availability === 'playable' && entries[i].track?.audio) { selectEntry(entries[i].entryId); return }
    }
    audioRef.current?.pause(); if (identity === 'guest') releaseGuestAudioLease()
  }, [identity, store, selectEntry])
  const next = useCallback(() => step(1), [step])
  const prev = useCallback(() => { if ((audioRef.current?.currentTime ?? 0) > 3) audioRef.current!.currentTime = 0; else step(-1) }, [step])
  const seek = useCallback((time: number) => { const audio = audioRef.current; if (audio && Number.isFinite(time) && Number.isFinite(audio.duration)) audio.currentTime = Math.min(Math.max(0, time), audio.duration) }, [])
  const restore = useCallback((id: string, time: number) => {
    audioRef.current?.pause(); intent.current = false; savedTime.current = Number.isFinite(time) ? Math.max(0, time) : 0
    if (!store.select(id)) { intent.current = null; savedTime.current = null }
  }, [store])
  useEffect(() => {
    if (!enabled || state.status !== 'ready' || identity === 'loading' || restoredIdentity.current === identity) return
    restoredIdentity.current = identity
    if (identity === 'guest' && !guestQueuePersistenceAvailable()) return
    const saved = readPlayback(identity)
    if (saved?.selectedEntryId && state.canonical.entries.some((entry) => entry.entryId === saved.selectedEntryId && entry.availability === 'playable' && entry.track?.audio)) {
      restore(saved.selectedEntryId, saved.position)
    }
  }, [enabled, identity, restore, state.status, state.canonical.entries])
  useEffect(() => {
    playbackToPersist.current = { version: 1, selectedEntryId: state.selectedEntryId, position: Number.isFinite(progress.currentTime) ? Math.max(0, progress.currentTime) : 0 }
  }, [state.selectedEntryId, progress.currentTime])
  useEffect(() => {
    if (!enabled || state.status !== 'ready' || identity === 'loading' || (identity === 'guest' && !guestQueuePersistenceAvailable())) return
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(playbackKey(identity), JSON.stringify(playbackToPersist.current)); lastPersistAt.current = Date.now() } catch { /* Playback resume is optional when storage is unavailable. */ }
    }, lastPersistAt.current ? Math.max(0, 1000 - (Date.now() - lastPersistAt.current)) : 0)
    return () => window.clearTimeout(timer)
  }, [enabled, identity, state.status, state.selectedEntryId, progress.currentTime])
  useEffect(() => {
    const save = () => {
      if (identity === 'loading' || (identity === 'guest' && !guestQueuePersistenceAvailable())) return
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
  }, [identity])
  const value = useMemo<Transport>(() => ({ current, queue: state.canonical.entries.flatMap((entry) => entry.track ? [entry.track] : []), playing,
    selectedEntryId: state.selectedEntryId, position: state.canonical.entries.findIndex((entry) => entry.entryId === state.selectedEntryId) + 1,
    count: state.canonical.entries.length, pending: state.status === 'pending' || state.status === 'loading', error: transportError ?? storageWarning ?? state.error,
    play, selectEntry, restore, toggle, next, prev, seek }), [current, state, playing, transportError, storageWarning, play, selectEntry, restore, toggle, next, prev, seek])
  function collectListen() {
    const audio = audioRef.current
    if (!audio || !current || !enabled || !advancing.current || audio.seeking || source.current !== state.selectedEntryId) return
    listenProgress.current.sample(audio.currentTime, performance.now(), audio.playbackRate)
    if (!listenProgress.current.qualifies(audio.duration) || counted.current === session.current) return
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
    if (!audio || !current?.audio || !enabled || source.current !== state.selectedEntryId) return
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
    onError={() => { suspendListen(); setPlaying(false); next() }}
    onEnded={() => { suspendListen(); setPlaying(false); session.current++; listenProgress.current = new ListenProgress(); playbackId.current = null; next() }}
    onEmptied={() => setProgress({ currentTime: 0, duration: 0 })}
    onTimeUpdate={() => { collectListen(); if (!audioRef.current?.paused) warmAudio(); setProgress((old) => ({ ...old, currentTime: audioRef.current?.currentTime ?? 0 })) }}
    onLoadedMetadata={() => { const audio = audioRef.current!; if (savedTime.current !== null && Number.isFinite(audio.duration)) { audio.currentTime = Math.min(savedTime.current, audio.duration); savedTime.current = null }; warmAudio(true); setProgress({ currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 }) }} />
  </ProgressContext.Provider></TransportContext.Provider>
}
