'use client'
import { useLocale, useText, useMessage } from '@/i18n/LocaleProvider'
import { message as localMessage } from '@/i18n/messages'

import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import type { TrackListItem } from '@/features/tracks/types'
import { TrackRow } from '@/features/tracks/components/TrackRow'
import { getAccountData, type AccountPage, type HistoryItem } from './api'
import { TrackMetadataEditor } from './TrackMetadataEditor'
import { useAccountData } from './useAccountData'

type Row = TrackListItem | HistoryItem
const rowId = (row: Row) => 'id' in row ? row.id : row._id

export function AccountTracks({ kind, revision }: { kind: 'uploads' | 'history' | 'favorites'; revision: number }) {
  const resolve = useMessage()

  const lt = useText()

  const { data, version, error, pending, retry } = useAccountData<AccountPage<Row>>(kind, revision)
  return (
    <Stack spacing={2} aria-busy={pending}>
      {error && <Alert severity="error" action={<Button onClick={retry}>{lt('tryAgain')}</Button>}>{resolve(error)}</Alert>}
      {pending && !data && <Typography role="status" color="text.secondary">{lt('loadingTracks')}</Typography>}
      {data && <AccountTrackPages key={version} kind={kind} initialPage={data} />}
    </Stack>
  )
}

function AccountTrackPages({ kind, initialPage }: { kind: 'uploads' | 'history' | 'favorites'; initialPage: AccountPage<Row> }) {
  const resolve = useMessage()

  const { locale } = useLocale()

  const lt = useText()

  const [page, setPage] = useState(initialPage)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
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
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : localMessage('couldNotLoadTracks'))
    } finally {
      if (request.current === controller) { request.current = null; setPending(false) }
    }
  }

  return (
    <Stack spacing={2}>
      {saved && <Alert severity="success" onClose={() => setSaved(false)}>{lt('changesSaved')}</Alert>}
      {editingId && <TrackMetadataEditor id={editingId} onClose={() => setEditingId(null)} onSaved={(track) => {
        setPage((old) => ({ ...old, items: old.items.map((row) => !('listenedAt' in row) && row._id === track._id
          ? { ...row, name: track.name, artist: track.artist } : row) }))
        setSaved(true)
      }} />}
      {!page.items.length && <Typography variant="body2" color="text.secondary">{kind === 'favorites' ? lt('noFavoriteTracksYetSelectTheHeartNextTo') : kind === 'uploads' ? lt('youHaveNotUploadedAnyTracksYet') : lt('youHaveNotPlayedAnyTracksSinceHistoryTracking')}</Typography>}
      {page.items.map((row) => (
        <Box key={rowId(row)}>
          {'listenedAt' in row ? <>
            <Typography component="time" dateTime={row.listenedAt} variant="caption" color="text.secondary">
              {new Date(row.listenedAt).toLocaleString(locale)}
            </Typography>
            {row.track ? <TrackRow track={row.track} /> : <Typography color="text.secondary">{lt('trackUnavailable')}</Typography>}
          </> : <>
            <TrackRow track={row} />
            {kind === 'uploads' && <Button size="small" aria-label={lt('editTrack', { p0: row.name })} onClick={() => { setSaved(false); setEditingId(row._id) }}>{lt('edit')}</Button>}
          </>}
        </Box>
      ))}
      {error && <Alert severity="error">{resolve(error)}</Alert>}
      {page.nextCursor && <Button onClick={() => void loadMore()} disabled={pending} sx={{ alignSelf: 'flex-start' }}>{pending ? lt('loading') : error ? lt('retryLoading') : lt('showMore')}</Button>}
    </Stack>
  )
}
