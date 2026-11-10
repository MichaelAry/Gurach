'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommentResponse } from '../types'
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
      setState({ trackId, items: page.items, nextCursor: page.nextCursor, loading: false, loadingMore: false, error: null })
    }).catch((cause: unknown) => {
      if (controller.signal.aborted || generation.current !== currentGeneration) return
      setState({
        trackId, items: [], nextCursor: null, loading: false, loadingMore: false,
        error: cause instanceof Error ? cause.message : 'Не удалось загрузить комментарии',
      })
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
          if (seen.has(item._id)) return false
          seen.add(item._id)
          return true
          })],
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
  return { ...current, loadMore, retry }
}
