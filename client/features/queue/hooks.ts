'use client'
import { useContext, useSyncExternalStore } from 'react'
import { QueueContext } from './QueueProvider'
export function useQueueStore() {
  const store = useContext(QueueContext)
  if (!store) throw new Error('QueueProvider is required')
  return store
}
export function useQueue() {
  const store = useQueueStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
}
