'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import type { TrackListPage, TrackListItem } from '@/features/tracks/types'
import { Section, MusicRows } from './MusicSection'
import { BlockState } from './BlockState'
type Event = {
  id: string
  user: { username: string; displayName: string }
  action: string
  at: string
  track: TrackListItem
}
export function ActivityFeed({
  authenticated,
  releases,
}: {
  authenticated: boolean
  releases: TrackListItem[]
}) {
  const [filter, setFilter] = useState('all'),
    [cursor, setCursor] = useState<string | null>(null)
  const [items, setItems] = useState<Event[]>([]),
    [next, setNext] = useState<string | null>(null)
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0)
  const social = authenticated && filter !== 'new'
  useEffect(() => {
    const controller = new AbortController()
    const path = social ? '/api/home/activity' : '/api/home/releases'
    fetch(path + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''), {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error()
        const page = (await r.json()) as
          { items: Event[]; nextCursor: string | null } | TrackListPage
        const rows: Event[] = social
          ? (page.items as Event[])
          : (page.items as TrackListItem[]).map((track) => ({
              id: track._id,
              track,
              action: 'release',
              at: '',
              user: { username: '', displayName: '' },
            }))
        if (!controller.signal.aborted) {
          setItems((old) =>
            cursor
              ? [
                  ...old,
                  ...rows.filter(
                    (row) => !old.some((item) => item.id === row.id),
                  ),
                ]
              : rows,
          )
          setNext(page.nextCursor)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true)
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [social, cursor, attempt])
  return (
    <Section title="Лента">
      <ToggleButtonGroup
        exclusive
        value={filter}
        size="small"
        aria-label="Фильтр ленты"
        onChange={(_, value: string | null) => {
          if (!value) return
          setFilter(value)
          setCursor(null)
          setItems([])
          setLoading(true)
          setError(false)
          setAttempt((a) => a + 1)
        }}
        sx={{ mb: 2 }}
      >
        <ToggleButton value="all">Все</ToggleButton>
        <ToggleButton value="friends" disabled={!authenticated}>
          Друзья
        </ToggleButton>
        <ToggleButton value="new">Новые треки</ToggleButton>
      </ToggleButtonGroup>
      {filter === 'all' && social && (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Новые релизы
          </Typography>
          <MusicRows tracks={releases.slice(0, 3)} />
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
            Активность друзей
          </Typography>
        </>
      )}
      <Stack spacing={1}>
        {items
          .filter(
            (item, index) =>
              !items
                .slice(0, index)
                .some(
                  (previous) =>
                    previous.user.username === item.user.username &&
                    previous.action === item.action &&
                    previous.track._id === item.track._id &&
                    previous.at.slice(0, 10) === item.at.slice(0, 10),
                ),
          )
          .map((item) => (
            <Stack key={item.id}>
              {item.user.username && (
                <Typography variant="body2" color="text.secondary">
                  <Link href={`/users/${item.user.username}`}>
                    {item.user.displayName}
                  </Link>{' '}
                  {item.action === 'upload'
                    ? 'опубликовал трек'
                    : item.action === 'rating'
                      ? 'оставил оценку и комментарий'
                      : 'прокомментировал'}
                  {items.filter(
                    (other) =>
                      other.user.username === item.user.username &&
                      other.action === item.action &&
                      other.track._id === item.track._id &&
                      other.at.slice(0, 10) === item.at.slice(0, 10),
                  ).length > 1
                    ? ' (несколько действий)'
                    : ''}{' '}
                  ·{' '}
                  <time dateTime={item.at}>
                    {new Date(item.at).toLocaleString('ru')}
                  </time>
                </Typography>
              )}
              <MusicRows tracks={[item.track]} />
            </Stack>
          ))}
      </Stack>
      <BlockState
        loading={loading}
        error={error}
        retry={() => {
          setError(false)
          setLoading(true)
          setAttempt((a) => a + 1)
        }}
      />
      {!loading && !error && items.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Пока нет новых событий. <Link href="/friends">Найти друзей</Link> или{' '}
          <Link href="/tracks">открыть каталог</Link>.
        </Typography>
      )}
      {next && (
        <Button
          disabled={loading}
          onClick={() => {
            setLoading(true)
            setCursor(next)
          }}
        >
          Показать ещё
        </Button>
      )}
    </Section>
  )
}
