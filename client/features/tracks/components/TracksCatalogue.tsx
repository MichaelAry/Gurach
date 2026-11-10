'use client'

import { Button, Stack, Typography } from '@mui/material'
import type { TrackListPage } from '../types'
import { useTrackPages } from '../hooks/useTrackPages'
import { TrackList } from './TrackList'

export function TracksCatalogue({ initialPage }: { initialPage: TrackListPage }) {
  const { tracks, nextCursor, loading, error, loadMore } = useTrackPages(initialPage)

  if (tracks.length === 0) {
    return <Typography sx={{ color: 'text.secondary' }}>Треков пока нет.</Typography>
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        При запуске трека в очередь попадут следующие загруженные треки, максимум 100.
      </Typography>
      <TrackList tracks={tracks} />
      {error && (
        <Typography color="error" role="alert">
          Не удалось загрузить следующую страницу. Попробуйте ещё раз.
        </Typography>
      )}
      {nextCursor && (
        <Button onClick={() => void loadMore()} disabled={loading} aria-busy={loading}>
          {loading ? 'Загружаем…' : error ? 'Повторить' : 'Загрузить ещё'}
        </Button>
      )}
      {!nextCursor && <Typography color="text.secondary">Все треки загружены.</Typography>}
    </Stack>
  )
}
