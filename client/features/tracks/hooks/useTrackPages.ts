'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TrackListItem, TrackListPage, TrackSearchPage } from '../types'
import { formatApiError, readApiError } from '@/lib/api/error'

type PageState = {
  query: string
  page: TrackListPage | TrackSearchPage
  loading: boolean
  error: string | null
}

export function useTrackPages(initialPage: TrackListPage, search = '') {
  const query = search.normalize('NFC').trim()
  const initialState = (): PageState => ({
    query,
    page: query ? { items: [], nextCursor: null } : initialPage,
    loading: Boolean(query),
    error: null,
  })
  const [state, setState] = useState<PageState>(initialState)
  const requestRef = useRef<AbortController | null>(null)

  // Reset the cursor and hide the previous results as soon as the filters change.
  if (state.query !== query) setState(initialState())

  const fetchPage = useCallback(async (cursor?: string) => {
    if (requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    setState((current) => ({ ...current, loading: true, error: null }))

    try {
      const params = new URLSearchParams()
      if (cursor) params.set('cursor', cursor)
      if (query) params.set('nameOrArtist', query)
      const endpoint = query ? '/api/tracks/search' : '/api/tracks'
      const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal })
      if (!response.ok) {
        const payload = await readApiError(response)
        throw new Error(formatApiError(payload?.error ?? null, 'Не удалось загрузить треки'))
      }
      const page = (await response.json()) as TrackListPage | TrackSearchPage
      if (!Array.isArray(page.items) || !(page.nextCursor === null || typeof page.nextCursor === 'string')) {
        throw new Error('Invalid page response')
      }
      if (controller.signal.aborted) return
      setState((current) => {
        if (current.query !== query) return current
        const seen = new Set(cursor ? current.page.items.map((track) => track._id) : [])
        const additions: TrackListItem[] = []
        for (const track of page.items) {
          if (seen.has(track._id)) continue
          seen.add(track._id)
          additions.push(track)
        }
        return { ...current, page: {
          items: cursor ? [...current.page.items, ...additions] : additions,
          nextCursor: page.nextCursor,
        } }
      })
    } catch (cause) {
      if (!controller.signal.aborted) {
        setState((current) => current.query === query ? {
          ...current,
          error: cause instanceof Error ? cause.message : 'Не удалось загрузить треки',
        } : current)
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        if (!controller.signal.aborted) {
          setState((current) => current.query === query ? { ...current, loading: false } : current)
        }
      }
    }
  }, [query])

  useEffect(() => {
    const timer = query ? setTimeout(() => void fetchPage(), 300) : undefined
    return () => {
      clearTimeout(timer)
      requestRef.current?.abort()
      requestRef.current = null
    }
  }, [query, fetchPage])

  const loadMore = () => {
    if (state.loading) return
    if (state.page.nextCursor || state.error) void fetchPage(state.page.nextCursor ?? undefined)
  }

  return { tracks: state.page.items, nextCursor: state.page.nextCursor, loading: state.loading, error: state.error, loadMore }
}
