'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommentResponse } from '../types'
import { commentRequest, type CreateComment } from '../api/mutateComment'
import { getCommentsPage } from '../api/getCommentsPage'

interface CommentPagesState {
  trackId: string
  items: CommentResponse[]
  nextCursor: string | null
  loading: boolean
  loadingMore: boolean
  error: string | null
}

export function useCommentPages(trackId: string) {
  const [state, setState] = useState<CommentPagesState>({
    trackId, items: [], nextCursor: null, loading: true, loadingMore: false, error: null,
  })
  const [retryKey, setRetryKey] = useState(0)
  const focusedTarget = useRef<string | null>(null)
  const deleted = useRef(new Set<string>())
  const mutationLock = useRef(false)
  const [mutating, setMutating] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [targetError, setTargetError] = useState<string | null>(null)
  const [targetAttempt, setTargetAttempt] = useState(0)
  const generation = useRef(0)
  const request = useRef<AbortController | null>(null)
  const moreInFlight = useRef(false)
  const current = state.trackId === trackId
    ? state
    : { trackId, items: [], nextCursor: null, loading: true, loadingMore: false, error: null }

  useEffect(() => {
    const currentGeneration = ++generation.current
    request.current?.abort()
    moreInFlight.current = false
    const controller = new AbortController()
    request.current = controller

    void getCommentsPage(trackId, { signal: controller.signal }).then((page) => {
      if (generation.current !== currentGeneration) return
      setState((previous) => {
        const items = previous.trackId === trackId ? previous.items : []
        const merged = new Map([...items, ...page.items].map((item) => [item._id, item]))
        return { trackId, items: [...merged.values()].filter((item) => !deleted.current.has(item._id)).sort((a, b) => b._id.localeCompare(a._id)), nextCursor: page.nextCursor, loading: false, loadingMore: false, error: null }
      })
    }).catch((cause: unknown) => {
      if (controller.signal.aborted || generation.current !== currentGeneration) return
      setState((previous) => ({
        ...previous, trackId, loading: false, loadingMore: false,
        error: cause instanceof Error ? cause.message : 'Не удалось загрузить комментарии',
      }))
    }).finally(() => {
      if (request.current === controller) request.current = null
    })

    return () => {
      controller.abort()
      if (request.current === controller) request.current = null
    }
  }, [trackId, retryKey])

  useEffect(() => () => request.current?.abort(), [])

  const loadMore = useCallback(async () => {
    if (!current.nextCursor || moreInFlight.current) return
    const controller = new AbortController()
    request.current = controller
    moreInFlight.current = true
    const currentGeneration = generation.current
    const cursor = current.nextCursor
    setState((previous) => previous.trackId === trackId
      ? { ...previous, loadingMore: true, error: null }
      : previous)
    try {
      const page = await getCommentsPage(trackId, { cursor, signal: controller.signal })
      if (generation.current !== currentGeneration) return
      setState((previous) => {
        if (previous.trackId !== trackId) return previous
        const seen = new Set(previous.items.map((item) => item._id))
        return {
          ...previous,
          items: [...previous.items, ...page.items.filter((item) => {
            if (seen.has(item._id) || deleted.current.has(item._id)) return false
            seen.add(item._id)
            return true
          })].sort((a, b) => b._id.localeCompare(a._id)),
          nextCursor: page.nextCursor,
          loadingMore: false,
          error: null,
        }
      })
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === currentGeneration) {
        setState((previous) => previous.trackId === trackId
          ? { ...previous, loadingMore: false, error: cause instanceof Error ? cause.message : 'Не удалось загрузить комментарии' }
          : previous)
      }
    } finally {
      if (generation.current === currentGeneration) {
        setState((previous) => previous.trackId === trackId ? { ...previous, loadingMore: false } : previous)
      }
      moreInFlight.current = false
      if (request.current === controller) request.current = null
    }
  }, [current.nextCursor, trackId])

  const retry = useCallback(() => {
    setState((previous) => previous.trackId === trackId
      ? { ...previous, loading: true, error: null }
      : previous)
    setRetryKey((current) => current + 1)
  }, [trackId])
  useEffect(() => {
    let controller: AbortController | undefined
    const resolve = () => {
      controller?.abort()
      const match = /^#comment-([a-f\d]{24})$/i.exec(window.location.hash)
      setTargetError(null)
      focusedTarget.current = null
      if (!match) return
      const id = match[1].toLowerCase()
      const existing = document.getElementById(`comment-${id}`)
      if (existing) { existing.scrollIntoView({ block: 'nearest' }); existing.focus({ preventScroll: true }); focusedTarget.current = window.location.hash; return }
      controller = new AbortController()
      const signal = controller.signal
      void commentRequest(`/tracks/${encodeURIComponent(trackId)}/comments/${id}`, 'GET', undefined, signal)
        .then((item) => {
          if (signal.aborted || deleted.current.has(item._id)) return
          setState((previous) => previous.trackId === trackId ? {
            ...previous, items: [...new Map([...previous.items, item].map((row) => [row._id, row])).values()].sort((a, b) => b._id.localeCompare(a._id)),
          } : previous)
        }).catch((cause: unknown) => {
          if (!signal.aborted) setTargetError(cause instanceof Error ? cause.message : 'Комментарий недоступен')
        })
    }
    resolve()
    window.addEventListener('hashchange', resolve)
    return () => { controller?.abort(); window.removeEventListener('hashchange', resolve) }
  }, [trackId, targetAttempt])

  useEffect(() => {
    const target = document.getElementById(window.location.hash.slice(1))
    if (target && window.location.hash.startsWith('#comment-') && focusedTarget.current !== window.location.hash) {
      target.scrollIntoView({ block: 'nearest' })
      target.focus({ preventScroll: true })
      focusedTarget.current = window.location.hash
    }
  }, [current.items])

  const mutate = async (path: string, method: string, body?: CreateComment) => {
    if (mutationLock.current) return false
    mutationLock.current = true
    setMutating(true)
    setMutationError(null)
    try {
      const item = await commentRequest(path, method, body)
      if (method === 'DELETE') deleted.current.add(item._id)
      setState((previous) => previous.trackId === trackId ? {
        ...previous,
        items: method === 'DELETE' ? previous.items.filter((row) => row._id !== item._id)
          : [item, ...previous.items.filter((row) => row._id !== item._id)],
      } : previous)
      return true
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : 'Не удалось выполнить запрос')
      return false
    } finally {
      mutationLock.current = false
      setMutating(false)
    }
  }
  return {
    ...current, loadMore, retry, mutating, mutationError, targetError,
    retryTarget: () => setTargetAttempt((value) => value + 1),
    addComment: (body: CreateComment) => mutate(`/tracks/${encodeURIComponent(trackId)}/comments`, 'POST', body),
    deleteComment: (id: string) => mutate(`/comments/${encodeURIComponent(id)}`, 'DELETE'),
  }
}
