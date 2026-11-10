'use client'

import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import type { TrackListItem } from '@/features/tracks/types'
import { TrackRow } from '@/features/tracks/components/TrackRow'
import { getAccountData, type AccountPage, type HistoryItem } from './api'
import { useAccountData } from './useAccountData'

type Row = TrackListItem | HistoryItem
const rowId = (row: Row) => 'id' in row ? row.id : row._id

export function AccountTracks({ kind, revision }: { kind: 'uploads' | 'history' | 'favorites'; revision: number }) {
  const { data, version, error, pending, retry } = useAccountData<AccountPage<Row>>(kind, revision)
  return (
    <Stack spacing={2} aria-busy={pending}>
      {error && <Alert severity="error" action={<Button onClick={retry}>Повторить</Button>}>{error}</Alert>}
      {pending && !data && <Typography role="status" color="text.secondary">Загружаем треки…</Typography>}
      {data && <AccountTrackPages key={version} kind={kind} initialPage={data} />}
    </Stack>
  )
}

function AccountTrackPages({ kind, initialPage }: { kind: 'uploads' | 'history' | 'favorites'; initialPage: AccountPage<Row> }) {
  const [page, setPage] = useState(initialPage)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  async function loadMore() {
    if (!page.nextCursor || request.current) return
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError(null)
    try {
      const next = await getAccountData<AccountPage<Row>>(`${kind}?${new URLSearchParams({ cursor: page.nextCursor })}`, controller.signal)
      if (controller.signal.aborted) return
      setPage((old) => {
        const seen = new Set(old.items.map(rowId))
        return { items: [...old.items, ...next.items.filter((row) => !seen.has(rowId(row)))], nextCursor: next.nextCursor }
      })
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить треки.')
    } finally {
      if (request.current === controller) { request.current = null; setPending(false) }
    }
  }

  return (
    <Stack spacing={2}>
      {!page.items.length && <Typography variant="body2" color="text.secondary">{kind === 'favorites' ? 'В избранном пока нет треков. Нажмите сердечко рядом с понравившимся треком.' : kind === 'uploads' ? 'Вы ещё не загрузили ни одного трека.' : 'Вы ещё не прослушали ни одного трека после начала учёта истории.'}</Typography>}
      {page.items.map((row) => (
        <Box key={rowId(row)}>
          {'listenedAt' in row ? <>
            <Typography component="time" dateTime={row.listenedAt} variant="caption" color="text.secondary">
              {new Date(row.listenedAt).toLocaleString('ru-RU')}
            </Typography>
            {row.track ? <TrackRow track={row.track} /> : <Typography color="text.secondary">Трек недоступен</Typography>}
          </> : <TrackRow track={row} />}
        </Box>
      ))}
      {error && <Alert severity="error">{error}</Alert>}
      {page.nextCursor && <Button onClick={() => void loadMore()} disabled={pending} sx={{ alignSelf: 'flex-start' }}>{pending ? 'Загружаем…' : error ? 'Повторить загрузку' : 'Показать ещё'}</Button>}
    </Stack>
  )
}
