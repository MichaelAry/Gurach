'use client'

import { Button, Stack, TextField, Typography } from '@mui/material'
import { useSearchParams } from 'next/navigation'
import type { TrackListPage } from '../types'
import { useTrackPages } from '../hooks/useTrackPages'
import { TrackList } from './TrackList'

export function TracksCatalogue({ initialPage }: { initialPage: TrackListPage }) {
  const params = useSearchParams()
  const search = params.get('query') ?? ''
  const { tracks, nextCursor, loading, error, loadMore } = useTrackPages(initialPage, search)
  const searching = Boolean(search.trim())

  function updateSearch(value: string) {
    const url = new URL(window.location.href)
    if (value) url.searchParams.set('query', value)
    else url.searchParams.delete('query')
    url.searchParams.delete('cursor')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }

  return (
    <Stack spacing={2}>
      <TextField
        label="Поиск по названию или исполнителю"
        type="search"
        value={search}
        onChange={(event) => updateSearch(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 200 } }}
        fullWidth
      />
      {search && <Button onClick={() => updateSearch('')}>Очистить поиск</Button>}
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
