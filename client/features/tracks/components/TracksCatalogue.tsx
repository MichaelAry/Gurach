'use client'
import { useText, useMessage } from '@/i18n/LocaleProvider'

import { Button, Stack, TextField, Typography } from '@mui/material'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { TrackListPage } from '../types'
import { useTrackPages } from '../hooks/useTrackPages'
import { TrackList } from './TrackList'

const subscribe = () => () => {}
const clientReady = () => true
const serverReady = () => false

export function TracksCatalogue({ initialPage }: { initialPage: TrackListPage }) {
  const resolve = useMessage()

  const lt = useText()
  const interactive = useSyncExternalStore(subscribe, clientReady, serverReady)

  const params = useSearchParams()
  const search = params.get('query') ?? ''
  const [input, setInput] = useState(search)
  const { tracks, nextCursor, loading, error, loadMore } = useTrackPages(initialPage, search)
  const searching = Boolean(search.trim())

  // Keep the field in sync with browser back/forward navigation.
  const [previousSearch, setPreviousSearch] = useState(search)
  if (previousSearch !== search) {
    setPreviousSearch(search)
    setInput(search)
  }

  function updateSearch(value: string) {
    const url = new URL(window.location.href)
    if (value) url.searchParams.set('query', value)
    else url.searchParams.delete('query')
    url.searchParams.delete('cursor')
    const nextUrl = `${url.pathname}${url.search}${url.hash}`
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, '', nextUrl)
    }
  }

  // Do not update the URL (and trigger catalogue state changes) on every keystroke.
  useEffect(() => {
    if (input === search) return
    const timer = setTimeout(() => updateSearch(input), 300)
    return () => clearTimeout(timer)
  }, [input, search])

  function clearSearch() {
    setInput('')
    updateSearch('')
  }

  return (
    <Stack spacing={2}>
      <TextField
        label={lt('searchByTitleOrArtist')}
        type="search"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 200 } }}
        fullWidth
      />
      {input && <Button onClick={clearSearch}>{lt('clearSearch')}</Button>}
      <Typography variant="body2" color="text.secondary">
        {lt('startingATrackAddsTheFollowingLoadedTracksTo')}</Typography>
      {tracks.length > 0 && <TrackList tracks={tracks} />}
      {loading && <Typography role="status" color="text.secondary">{lt('loadingTracks')}</Typography>}
      {!loading && !error && tracks.length === 0 && (
        <Typography color="text.secondary" role="status">
          {searching ? lt('noResultsForYourSearch') : lt('noTracksYet')}
        </Typography>
      )}
      {error && <Typography color="error" role="alert">{resolve(error)}</Typography>}
      {(nextCursor || error) && (
        <Button onClick={loadMore} disabled={loading || !interactive} aria-busy={loading}>
          {loading ? lt('loading') : error ? lt('tryAgain') : lt('loadMore')}
        </Button>
      )}
      {!loading && !error && !nextCursor && tracks.length > 0 && (
        <Typography color="text.secondary">{searching ? lt('allResultsLoaded') : lt('allTracksLoaded')}</Typography>
      )}
    </Stack>
  )
}
