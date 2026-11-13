'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Stack, Typography } from '@mui/material'
import type { components } from '@/lib/api/schema'
import { Section, MusicRows } from './MusicSection'
import { BlockState } from './BlockState'
type ActivityPage = components['schemas']['HomeActivityPage']
type Event = ActivityPage['items'][number]
export function ActivityFeed() {
  const [cursor, setCursor] = useState<string | null>(null)
  const [items, setItems] = useState<Event[]>([]),
    [next, setNext] = useState<string | null>(null)
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/home/activity' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''), {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error()
        const page: ActivityPage = await r.json()
        const rows = page.items
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
  }, [cursor, attempt])
  return (
    <Section title="Активность друзей">
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
      {next && !error && (
        <Button
          disabled={loading}
          onClick={() => {
            setError(false)
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
