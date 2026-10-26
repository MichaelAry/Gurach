// features/tracks/components/ListenCountsProvider.tsx
'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ListenCountsContextValue = {
  /** Оверрайды listens по id трека. Приоритетнее серверного пропа. */
  overrides: Record<string, number>
  /** Увеличить на 1 (оптимистично) или выставить точное значение. */
  bump: (trackId: string, next?: number) => void
}

const ListenCountsContext = createContext<ListenCountsContextValue | null>(null)

export function ListenCountsProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, number>>({})

  const bump = useCallback((trackId: string, next?: number) => {
    setOverrides((prev) => ({
      ...prev,
      [trackId]: typeof next === 'number' ? next : (prev[trackId] ?? 0) + 1,
    }))
  }, [])

  return (
    <ListenCountsContext.Provider value={{ overrides, bump }}>
      {children}
    </ListenCountsContext.Provider>
  )
}

/**
 * Возвращает актуальное число прослушиваний:
 * оверрайд из стора, если он есть, иначе — серверное значение из пропа.
 */
export function useListenCount(trackId: string, serverValue: number): number {
  const ctx = useContext(ListenCountsContext)
  if (!ctx) return serverValue
  return ctx.overrides[trackId] ?? serverValue
}

/** Хук для вызова bump из клиентских компонентов (PlayButton и т.п.). */
export function useBumpListen() {
  const ctx = useContext(ListenCountsContext)
  if (!ctx) {
    throw new Error('useBumpListen must be used inside <ListenCountsProvider>')
  }
  return ctx.bump
}
