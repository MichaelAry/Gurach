'use client'

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { useViewer } from '@/features/auth/ViewerProvider'

type ListenCountsContextValue = {
  counts: Record<string, number>
  revision: number
  recordListen: (trackId: string, playbackId: string) => Promise<boolean>
}

const ListenCountsContext = createContext<ListenCountsContextValue | null>(null)

/** Live counts are confirmed by Nest; failed requests never change the display. */
export function ListenCountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [revision, setRevision] = useState(0)
  const { user } = useViewer()
  const recordListen = useCallback(
    async (trackId: string, playbackId: string): Promise<boolean> => {
      try {
        const response = await fetch(
          user ? '/api/account/listens' : `/api/tracks/${encodeURIComponent(trackId)}/listen`,
          {
            method: 'POST',
            headers: { 'X-Gurach-Request': '1', ...(user ? { 'content-type': 'application/json' } : {}) },
            ...(user ? { body: JSON.stringify({ trackId, playbackId }) } : {}),
            signal: AbortSignal.timeout(15_000),
          },
        )
        if (!response.ok) return false
        const body: unknown = await response.json()
        if (
          typeof body !== 'object' ||
          body === null ||
          !('listens' in body) ||
          typeof body.listens !== 'number' ||
          !Number.isSafeInteger(body.listens) ||
          body.listens < 0
        ) {
          return false
        }
        const value = body.listens
        setCounts((previous) => ({
          ...previous,
          [trackId]: Math.max(previous[trackId] ?? 0, value),
        }))
        setRevision((old) => old + 1)
        return true
      } catch {
        return false
      }
    },
    [user],
  )

  return (
    <ListenCountsContext.Provider value={{ counts, revision, recordListen }}>
      {children}
    </ListenCountsContext.Provider>
  )
}

export function useListenRevision() {
  return useContext(ListenCountsContext)?.revision ?? 0
}

export function useListenCount(trackId: string, serverValue: number): number {
  const context = useContext(ListenCountsContext)
  return Math.max(context?.counts[trackId] ?? 0, serverValue)
}

export function useRecordListen() {
  const context = useContext(ListenCountsContext)
  if (!context)
    throw new Error(
      'useRecordListen must be used inside <ListenCountsProvider>',
    )
  return context.recordListen
}
