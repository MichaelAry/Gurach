'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TrackListItem, TrackListPage } from '../types'
import { formatApiError, readApiError } from '@/lib/api/error'

export function useTrackPages(initialPage: TrackListPage) {
  const [tracks, setTracks] = useState(initialPage.items)
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => {
    requestRef.current?.abort()
    requestRef.current = null
  }, [])

  const loadMore = useCallback(async () => {
    if (!nextCursor || requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError(null)

    try {
      const query = new URLSearchParams({ cursor: nextCursor })
      const response = await fetch(`/api/tracks?${query}`, {
        signal: controller.signal,
      })
      if (!response.ok) {
        const payload = await readApiError(response)
        throw new Error(formatApiError(payload?.error ?? null, 'Не удалось загрузить треки'))
      }
      const page = (await response.json()) as TrackListPage
      if (!Array.isArray(page.items) || !(page.nextCursor === null || typeof page.nextCursor === 'string')) {
        throw new Error('Invalid page response')
      }
      setTracks((current) => {
        const seen = new Set(current.map((track) => track._id))
        const additions: TrackListItem[] = []
        for (const track of page.items) {
          if (seen.has(track._id)) continue
          seen.add(track._id)
          additions.push(track)
        }
        return [...current, ...additions]
      })
      setNextCursor(page.nextCursor)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить треки')
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }, [nextCursor])

  return { tracks, nextCursor, loading, error, loadMore }
}
