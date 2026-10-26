'use client'

import type { ITrack } from '@/types/track'
import { useBumpListen } from '@/features/tracks/components/ListenCountsProvider'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

interface PlayerContextValue {
  /** Трек, который сейчас играет (или последний выбранный). */
  current: ITrack | null
  /** Очередь для prev/next — обычно весь список, с которого начали слушать. */
  queue: ITrack[]
  playing: boolean
  currentTime: number
  duration: number
  /** Выбрать трек. Если это уже текущий — переключает play/pause. */
  play: (track: ITrack, queue?: ITrack[]) => void
  toggle: () => void
  next: () => void
  prev: () => void
  seek: (seconds: number) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

/** Хук для доступа к плееру из любых клиентских компонентов. */
export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) {
    throw new Error('usePlayer must be used inside <PlayerProvider>')
  }
  return ctx
}

/**
 * Глобальный аудио-плеер: один <audio> на всё приложение + состояние
 * (текущий трек, очередь, позиция). Ничего не знает о роутинге Next.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [current, setCurrent] = useState<ITrack | null>(null)
  const [queue, setQueue] = useState<ITrack[]>([])
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // Какой трек уже "засчитан" в прослушивания (чтобы не дублировать при паузе)
  const countedRef = useRef<string | null>(null)

  // Оптимистичный счётчик прослушиваний из ListenCountsProvider —
  // он всегда есть выше по дереву (AppThemeProvider в app/layout.tsx).
  const bumpListen = useBumpListen()

  // Новый трек → выставить источник и запустить воспроизведение.
  // Здесь только работа с внешней системой (<audio>); состояния (playing,
  // currentTime, duration) обновляются в обработчиках событий аудио и в
  // play() — иначе React-хуки ругаются на setState внутри эффекта.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (!current?._id || !current.audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      return
    }

    audio.src = current.audio

    // autoplay-политика браузера может заблокировать — тогда просто не играем
    void audio.play().catch(() => setPlaying(false))
  }, [current?._id, current?.audio])

  const play = useCallback(
    (track: ITrack, nextQueue?: ITrack[]) => {
      if (!track.audio) return // у старых треков в БД нет аудио — нечего играть

      if (current?._id === track._id) {
        const audio = audioRef.current
        if (!audio) return
        if (audio.paused) void audio.play().catch(() => setPlaying(false))
        else audio.pause()
        return
      }

      // Сброс позиции — синхронно, в обработчике клика (не в эффекте)
      setCurrentTime(0)
      setDuration(0)
      setQueue(nextQueue && nextQueue.length > 0 ? nextQueue : [track])
      setCurrent(track)
    },
    [current?._id],
  )

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !current?.audio) return
    if (audio.paused) void audio.play().catch(() => setPlaying(false))
    else audio.pause()
  }, [current?.audio])

  const step = useCallback(
    (delta: number) => {
      if (queue.length === 0 || !current) return
      const index = queue.findIndex((t) => t._id === current._id)
      const target = queue[index + delta]
      if (target?.audio) setCurrent(target)
      else audioRef.current?.pause()
    },
    [current, queue],
  )

  const next = useCallback(() => step(1), [step])
  const prev = useCallback(() => step(-1), [step])

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current
    if (audio) audio.currentTime = seconds
  }, [])

  const handlePlay = useCallback(() => {
    setPlaying(true)

    const id = current?._id
    if (!id || countedRef.current === id) return
    countedRef.current = id

    // Оптимистично обновляем счётчик в клиентском сторе,
    // затем информируем сервер через Next route handler (см. app/api/tracks/[id]/listen)
    bumpListen(id)
    void fetch(`/api/tracks/${id}/listen`, { method: 'POST' }).catch(() => undefined)
  }, [current?._id, bumpListen])

  const handlePause = useCallback(() => setPlaying(false), [])

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (audio) setCurrentTime(audio.currentTime)
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current
    const value = audio?.duration
    setDuration(Number.isFinite(value ?? NaN) ? (value as number) : 0)
  }, [])

  const handleEnded = useCallback(() => {
    setPlaying(false)
    next()
  }, [next])

  const value: PlayerContextValue = {
    current,
    queue,
    playing,
    currentTime,
    duration,
    play,
    toggle,
    next,
    prev,
    seek,
  }

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* Единственный аудио-элемент приложения */}
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={handlePlay}
        onPause={handlePause}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />
    </PlayerContext.Provider>
  )
}
