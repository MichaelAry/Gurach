'use client'
import { useState } from 'react'
import { message } from '@/i18n/messages'
import { useQueue, useQueueStore } from './hooks'
import type { QueueCommand } from './types'

/** Keep transport feedback beside the action that initiated the mutation. */
export function useQueueAction() {
  const store = useQueueStore()
  const state = useQueue()
  const [feedback, setFeedback] = useState<{ error?: string; success?: string; revision?: number; confirmation?: boolean }>({})
  function reset() { setFeedback({}) }
  async function run(command: QueueCommand, success: string, expectedRevision?: number) {
    reset()
    if (expectedRevision !== undefined && store.getSnapshot().canonical.revision !== expectedRevision) {
      setFeedback({ error: message('queueConfirmationChanged'), revision: store.getSnapshot().canonical.revision, confirmation: true })
      return false
    }
    const saved = await store.dispatch(command)
    setFeedback({ ...(saved ? { success } : { error: store.getSnapshot().error ?? message('theQueueWasNotSavedCheckItsStateIn') }), revision: store.getSnapshot().canonical.revision })
    return saved
  }
  const stale = feedback.revision !== state.canonical.revision
    || (feedback.error && !feedback.confirmation && state.status === 'ready' && !state.error)
  return { feedback: stale ? {} : { error: feedback.error, success: feedback.success }, reset, run }
}
