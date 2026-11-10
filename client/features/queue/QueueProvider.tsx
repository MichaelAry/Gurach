'use client'
import { createContext, useEffect, useMemo, type ReactNode } from 'react'
import type { QueueAdapter } from './types'
import { QueueStore } from './queueStore'
export const QueueContext = createContext<QueueStore | null>(null)
/** Adapter identity must change with the account; disposal rejects all stale completions. */
export function QueueProvider({ adapter, children }: { adapter: QueueAdapter; children: ReactNode }) {
  const store = useMemo(() => new QueueStore(adapter), [adapter])
  useEffect(() => { void store.start(); return () => store.dispose() }, [store])
  return <QueueContext.Provider value={store}>{children}</QueueContext.Provider>
}
