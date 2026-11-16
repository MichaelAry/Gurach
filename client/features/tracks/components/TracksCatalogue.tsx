'use client'

import { Button, Stack, TextField, Typography } from '@mui/material'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { TrackListPage } from '../types'
import { useTrackPages } from '../hooks/useTrackPages'
import { TrackList } from './TrackList'

export function TracksCatalogue({ initialPage }: { initialPage: TrackListPage }) {
  const params = useSearchParams()
  const search = params.get('query') ?? ''
  const [input, setInput] = useState(search)
  const { tracks, nextCursor, loading, error, loadMore } = useTrackPages(initialPage, search)
  const searching = Boolean(search.trim())

  // Keep the field in sync with browser back/forward navigation.
  useEffect(() => setInput(search), [search])

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
        label="Поиск по названию или исполнителю"
        type="search"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 200 } }}
        fullWidth
      />
      {input && <Button onClick={clearSearch}>Очистить поиск</Button>}
      <Typography variant="body2" color="text.secondary">
        При запуске трека в очередь попадут следующие загруженные треки, максимум 100.
      </Typography>
      {tracks.length > 0 && <TrackList tracks={tracks} />}
      {loading && <Typography role="status" color="text.secondary">Загружаем треки…</Typography>}
      {!loading && !error && tracks.length === 0 && (
        <Typography color="text.secondary" role="status">
          {searching ? 'По вашему запросу ничего не найдено.' : 'Треков пока нет.'}
        </Typography>
      )}
      {error && <Typography color="error" role="alert">{error}</Typography>}
      {(nextCursor || error) && (
        <Button onClick={loadMore} disabled={loading} aria-busy={loading}>
          {loading ? 'Загружаем…' : error ? 'Повторить' : 'Загрузить ещё'}
        </Button>
      )}
      {!loading && !error && !nextCursor && tracks.length > 0 && (
        <Typography color="text.secondary">{searching ? 'Все результаты загружены.' : 'Все треки загружены.'}</Typography>
      )}
    </Stack>
  )
}
