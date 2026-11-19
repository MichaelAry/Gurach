'use client'

import { useEffect, useRef, useState } from 'react'
import { COVER_EXTENSIONS_BY_TYPE, MAX_COVER_BYTES, type MetadataCandidate, type MetadataDetails, type MetadataSearch } from '../catalogMetadata'

type LookupState = { status: 'idle' | 'searching' | 'empty' | 'unavailable' } | {
  status: 'results'
  candidates: MetadataCandidate[]
  selected: number | null
  details?: MetadataDetails
  detailError?: 'unavailable' | 'mismatch'
  artwork?: File
  artworkStatus?: 'loading' | 'missing' | 'unavailable'
}

class CatalogMismatch extends Error {}

async function lookup<T>(endpoint: string, body: object, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/metadata/${endpoint}`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'X-Gurach-Request': '1' },
    body: JSON.stringify(body),
  })
  if (endpoint === 'details' && response.status === 400) throw new CatalogMismatch()
  if (!response.ok) throw new Error('Metadata unavailable')
  return response.json() as Promise<T>
}

export function useDuration(file: File | null) {
  const duration = useRef<{ file: File; ms: number } | null>(null)
  useEffect(() => {
    if (!file) return
    const audio = document.createElement('audio')
    const url = URL.createObjectURL(file)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const ms = Math.round(audio.duration * 1000)
      if (Number.isFinite(ms) && ms >= 0 && ms <= 3_600_000) duration.current = { file, ms }
    }
    audio.src = url
    return () => {
      audio.onloadedmetadata = null
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
    }
  }, [file])
  return duration
}

export function useObjectUrl(file: File | null | undefined) {
  const [preview, setPreview] = useState<{ file: File; url: string }>()
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    let disposed = false
    queueMicrotask(() => { if (!disposed) setPreview({ file, url }) })
    return () => {
      disposed = true
      URL.revokeObjectURL(url)
    }
  }, [file])
  return preview?.file === file ? preview?.url : undefined
}

export function useMetadataLookup({ active, name, artist, audio, duration, source, lastfm = false }: {
  duration: ReturnType<typeof useDuration>
  source: 'musicbrainz' | 'theaudiodb' | 'discogs'
  lastfm?: boolean
  active: boolean
  name: string
  artist: string
  audio: File | null
}) {
  const [state, setState] = useState<LookupState>({ status: 'idle' })
  const current = useRef<{ controller: AbortController; timer?: ReturnType<typeof setTimeout> }>(null)
  const artworkCache = useRef(new Map<string, File | null>())

  function cancel() {
    current.current?.controller.abort()
    clearTimeout(current.current?.timer)
    current.current = null
  }
  function invalidate() {
    cancel()
    setState({ status: 'idle' })
  }
  function start() {
    cancel()
    const request = { controller: new AbortController() }
    current.current = request
    return request.controller.signal
  }

  function rememberArtwork(release: string, file: File | null) {
    artworkCache.current.set(release, file)
    if (artworkCache.current.size > 5) artworkCache.current.delete(artworkCache.current.keys().next().value!)
  }

  async function select(candidates: MetadataCandidate[], selected: number, signal = start()) {
    if (!active || signal.aborted) return
    setState({ status: 'results', candidates, selected })
    const { recordingMbid, releaseMbid, catalogId } = candidates[selected]
    let details: MetadataDetails
    try {
      const identity = catalogId ? { catalogId, name: name.trim(), artist: artist.trim() || undefined }
        : { recordingMbid, releaseMbid: releaseMbid ?? undefined, lastfm }
      details = await lookup<MetadataDetails>('details', { source, ...identity }, signal)
    } catch (error) {
      if (!signal.aborted) setState({ status: 'results', candidates, selected,
        detailError: error instanceof CatalogMismatch ? 'mismatch' : 'unavailable' })
      return
    }
    if (signal.aborted) return
    const result = { status: 'results' as const, candidates, selected, details }
    if (!details.artworkUrl || !details.releaseMbid) {
      setState(result)
      return
    }
    const cached = artworkCache.current.get(details.releaseMbid)
    if (cached !== undefined) {
      setState(cached ? { ...result, artwork: cached } : { ...result, artworkStatus: 'missing' })
      return
    }
    setState({ ...result, artworkStatus: 'loading' })
    try {
      const response = await fetch(details.artworkUrl, { signal })
      if (signal.aborted) return
      if (response.status === 404) {
        rememberArtwork(details.releaseMbid, null)
        setState({ ...result, artworkStatus: 'missing' })
        return
      }
      if (!response.ok) throw new Error('Artwork unavailable')
      const blob = await response.blob()
      if (signal.aborted) return
      const extension = COVER_EXTENSIONS_BY_TYPE[blob.type]
      if (!extension || !blob.size || blob.size > MAX_COVER_BYTES) throw new Error('Invalid artwork')
      const artwork = new File([blob], `cover-${details.releaseMbid}.${extension}`, { type: blob.type })
      rememberArtwork(details.releaseMbid, artwork)
      setState({ ...result, artwork })
    } catch {
      if (!signal.aborted) setState({ ...result, artworkStatus: 'unavailable' })
    }
  }

  async function search(signal = start()) {
    if (!active || signal.aborted || !name.trim()) return
    setState({ status: 'searching' })
    try {
      const durationMs = duration.current?.file === audio ? duration.current.ms : undefined
      const result = await lookup<MetadataSearch>('search', { source, name: name.trim(), artist: artist.trim() || undefined, durationMs }, signal)
      if (signal.aborted) return
      if (!result.candidates.length) setState({ status: 'empty' })
      else if (result.recommendedIndex !== null && result.candidates[result.recommendedIndex]) {
        await select(result.candidates, result.recommendedIndex, signal)
      } else setState({ status: 'results', candidates: result.candidates, selected: null })
    } catch {
      if (!signal.aborted) setState({ status: 'unavailable' })
    }
  }

  useEffect(() => {
    if (!active || !name.trim() || !artist.trim()) return cancel
    const signal = start()
    current.current!.timer = setTimeout(() => { void search(signal) }, 700)
    return cancel
    // The timer owns a snapshot of the inputs for this lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, name, artist, audio, source, lastfm])

  return { state: active ? state : { status: 'idle' as const }, invalidate, search, select }
}
