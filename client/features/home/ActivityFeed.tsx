'use client'
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from '@/i18n/LocaleProvider'
import Link from 'next/link'
import { Button, Stack, Typography } from '@mui/material'
import type { components } from '@/lib/api/schema'
import { Section, MusicRows } from './MusicSection'
import { BlockState } from './BlockState'
type ActivityPage = components['schemas']['HomeActivityPage']
type Event = ActivityPage['items'][number]
export function ActivityFeed() {
  const t = useTranslations('home')
  const { locale } = useLocale()
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
                  ...new Map(
                    [...old, ...rows].map((item) => [
                      `${item.action === 'upload' ? 'upload' : 'comment'}:${item.id}`,
                      item,
                    ]),
                  ).values(),
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
  const groups = useMemo(() => {
    const grouped = new Map<string, { item: Event; count: number }>()
    for (const item of items) {
      const key = JSON.stringify([
        item.user.username,
        item.action,
        item.track._id,
        item.at.slice(0, 10),
      ])
      const group = grouped.get(key)
      if (group) group.count++
      else grouped.set(key, { item, count: 1 })
    }
    return [...grouped.values()]
  }, [items])
  return (
    <Section title={t('fromFriends')}>
      <Stack spacing={1}>
        {groups.map(({ item, count }) => (
          <Stack key={`${item.action}:${item.id}`}>
            <Typography variant="body2" color="text.secondary">
              <Link href={`/users/${item.user.username}`}>{item.user.displayName}</Link>{' '}
              {t(
                item.action === 'upload'
                  ? 'activityUpload'
                  : item.action === 'rating'
                    ? 'activityRating'
                    : 'activityComment',
              )}{' '}
              {count > 1 ? t('activityRepeated') : ''} ·{' '}
              <time dateTime={item.at}>{new Date(item.at).toLocaleString(locale)}</time>
            </Typography>
            {item.action !== 'upload' && (
              <Link href={`/tracks/${item.track._id}#comment-${item.id}`}>{t('openComment')}</Link>
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
          {t('activityEmpty')} <Link href="/friends">{t('findFriends')}</Link> ·{' '}
          <Link href="/tracks">{t('activityCatalog')}</Link>.
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
          {t('more')}
        </Button>
      )}
    </Section>
  )
}
