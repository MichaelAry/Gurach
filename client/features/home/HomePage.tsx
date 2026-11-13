'use client'
import type { AccountStatistics, HistoryItem } from '@/features/account/api'
import { useViewer } from '@/features/auth/ViewerProvider'
import type { FriendListPage } from '@/features/friends/api'
import { usePlayer } from '@/features/player/PlayerProvider'
import { QueuePanel } from '@/features/queue/components/QueuePanel'
import type { TrackListItem, TrackListPage } from '@/features/tracks/types'
import { Box, Button, LinearProgress, Stack, Typography } from '@mui/material'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ActivityFeed } from './ActivityFeed'
import { BlockState } from './BlockState'
import { MusicRows, Section } from './MusicSection'
import { useHomeBlock } from './useHomeBlock'
function ContinueListening() {
  const player = usePlayer()
  if (!player.current) return null
  return (
    <Section title="Продолжить прослушивание">
      <MusicRows tracks={[player.current]} />
      <LinearProgress
        aria-label="Прогресс воспроизведения"
        variant="determinate"
        value={
          player.duration > 0 ? Math.min(100, (player.currentTime / player.duration) * 100) : 0
        }
        sx={{ mt: 1.5 }}
      />
      <Button disabled={player.pending} onClick={player.toggle} sx={{ mt: 1 }}>
        {player.playing ? 'Пауза' : 'Продолжить'}
      </Button>
    </Section>
  )
}
type ReleasesBlock = ReturnType<typeof useHomeBlock<TrackListPage>>
function Releases({ block }: { block: ReleasesBlock }) {
  const [cursor, setCursor] = useState<string | null>(null)
  const [page, setPage] = useState<TrackListPage>({ items: [], nextCursor: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!cursor) return
    const controller = new AbortController()
    fetch(`/api/home/releases?cursor=${encodeURIComponent(cursor)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error()
        return response.json() as Promise<TrackListPage>
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setPage((old) => ({
          items: [
            ...new Map([...old.items, ...data.items].map((track) => [track._id, track])).values(),
          ],
          nextCursor: data.nextCursor,
        }))
        setLoading(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setError(true)
        setLoading(false)
      })
    return () => controller.abort()
  }, [cursor, attempt])
  const tracks = [
    ...new Map(
      [...(block.data?.items ?? []), ...page.items].map((track) => [track._id, track]),
    ).values(),
  ]
  const next = cursor ? page.nextCursor : block.data?.nextCursor
  return (
    <Section title="Новые треки" href="/tracks">
      <BlockState {...block} />
      <MusicRows tracks={tracks} />
      {block.data?.items.length === 0 && (
        <Typography color="text.secondary">Первые релизы скоро появятся здесь.</Typography>
      )}
      <BlockState
        loading={loading}
        error={error}
        retry={() => {
          setError(false)
          setLoading(true)
          setAttempt((value) => value + 1)
        }}
      />
      {next && !error && (
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
function Popular() {
  const block = useHomeBlock<{ items: TrackListItem[] }>('/api/home/popular')
  return (
    <Section title="Популярное за 7 дней">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Рейтинг по прослушиваниям вошедших пользователей за последние 7 дней.
      </Typography>
      <BlockState {...block} />
      {block.data &&
        (block.data.items.length ? (
          <MusicRows tracks={block.data.items} />
        ) : (
          <Typography color="text.secondary" variant="body2">
            Пока недостаточно прослушиваний. Откройте новые треки.
          </Typography>
        ))}
    </Section>
  )
}
function Personal({ releases }: { releases: ReleasesBlock }) {
  const tracks = releases.data?.items
  const history = useHomeBlock<{ items: HistoryItem[] }>('/api/account/history?count=30')
  const favorites = useHomeBlock<TrackListPage>('/api/account/favorites?count=30')
  const stats = useHomeBlock<AccountStatistics>('/api/account/statistics')
  const friends = useHomeBlock<FriendListPage>('/api/friends?count=5')
  const recommendations = useMemo(() => {
    const artists = new Set([
      ...(history.data?.items.flatMap((i) => (i.track?.artist ? [i.track.artist] : [])) ?? []),
      ...(favorites.data?.items.flatMap((i) => (i.artist ? [i.artist] : [])) ?? []),
    ])
    const heard = new Set(history.data?.items.map((i) => i.trackId))
    return [...(tracks ?? [])]
      .sort(
        (a, b) =>
          Number(artists.has(b.artist ?? '')) * 3 +
          Number(!heard.has(b._id)) -
          (Number(artists.has(a.artist ?? '')) * 3 + Number(!heard.has(a._id))),
      )
      .slice(0, 5)
  }, [tracks, history.data, favorites.data])
  const hasPersonalHistory = !!history.data?.items.length || !!favorites.data?.items.length
  const personalLoading = history.loading || favorites.loading
  const personalError = history.error || favorites.error
  const showPersonal =
    personalLoading || personalError ||
    (hasPersonalHistory && (releases.loading || releases.error || recommendations.length > 0))
  const personalReady = !personalLoading && !personalError && !releases.loading && !releases.error
  const artists = [
    ...new Set(history.data?.items.flatMap((i) => (i.track?.artist ? [i.track.artist] : [])) ?? []),
  ].slice(0, 3)
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - 6 + i)
    return {
      day: date.toLocaleDateString('ru', { weekday: 'short' }),
      count:
        history.data?.items.filter(
          (item) => new Date(item.listenedAt).toDateString() === date.toDateString(),
        ).length ?? 0,
    }
  })
  return (
    <>
      {showPersonal && (
        <Section title="Для вас">
          <BlockState
            loading={personalLoading || (hasPersonalHistory && releases.loading)}
            error={personalError || (hasPersonalHistory && releases.error)}
            retry={() => {
              if (history.error) history.retry()
              if (favorites.error) favorites.retry()
              if (releases.error) releases.retry()
            }}
          />
          {personalReady && hasPersonalHistory && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Знакомые исполнители и свежие открытия
              </Typography>
              <MusicRows tracks={recommendations} />
            </>
          )}
        </Section>
      )}
      <Section title="Ваша музыка" href="/account">
        <BlockState {...stats} />
        {stats.data && stats.data.totalListens > 0 ? (
          <Stack spacing={1}>
            <Typography>
              {stats.data.totalListens} прослушиваний · {stats.data.uniqueTracks} композиций
            </Typography>
            {artists.length > 0 && (
              <Typography variant="body2">Недавние исполнители: {artists.join(', ')}</Typography>
            )}
            {week.some((d) => d.count > 0) && (
              <Typography variant="body2" color="text.secondary">
                Последние 30 прослушиваний за неделю:{' '}
                {week.map((d) => `${d.day} ${d.count}`).join(' · ')}
              </Typography>
            )}
            {history.data && (
              <MusicRows
                tracks={[
                  ...new Map(
                    history.data.items.flatMap((i) =>
                      i.track ? [[i.track._id, i.track] as const] : [],
                    ),
                  ).values(),
                ].slice(0, 3)}
              />
            )}
          </Stack>
        ) : (
          stats.data && (
            <Typography variant="body2" color="text.secondary">
              Слушайте музыку — здесь появятся ваши открытия.
            </Typography>
          )
        )}
      </Section>
      <Section title="Друзья" href="/friends">
        <BlockState {...friends} />
        {friends.data?.items.map((friend) => (
          <Button
            key={friend.id}
            component={Link}
            href={`/users/${friend.username}`}
            sx={{ display: 'block', textAlign: 'left' }}
          >
            {friend.displayName}
          </Button>
        ))}
        {friends.data?.items.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Откройте музыку вместе. <Link href="/friends">Найти друзей</Link>
          </Typography>
        )}
      </Section>
    </>
  )
}
export default function HomePage() {
  const viewer = useViewer()
  // Session providers remount their children when the viewer becomes known.
  // Wait for that transition before starting the home requests.
  if (viewer.loading) {
    return (
      <Box sx={{ width: '100%', p: 3 }}>
        <LinearProgress aria-label="Загрузка главной страницы" />
      </Box>
    )
  }
  return <HomeContent />
}
function HomeContent() {
  const viewer = useViewer(),
    releases = useHomeBlock<TrackListPage>('/api/home/releases')
  const [queueOpen, setQueueOpen] = useState(false)
  return (
    <Box
      data-home-page
      sx={{
        maxWidth: 1200,
        mx: 'auto',
        px: { xs: 2, md: 3 },
        py: { xs: 2, md: 4 },
      }}
    >
      <Typography variant="overline" color="text.secondary">
        GURACH / МУЗЫКА РЯДОМ
      </Typography>
      <Typography component="h1" variant="h4" sx={{ mb: 1 }}>
        Музыка на сегодня
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {viewer.user
          ? `${viewer.user.displayName}, откройте что-нибудь новое.`
          : 'Новые звуки, любимые исполнители и люди с похожим вкусом.'}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: 'minmax(0, 2fr) minmax(280px, 1fr)',
          },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <ContinueListening />
          <Releases block={releases} />
          <Popular />
          {viewer.user && <ActivityFeed key={viewer.user.id} />}
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Быстрый доступ">
            <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button component={Link} href="/tracks">
                Каталог
              </Button>
              <Button component={Link} href="/favorites">
                Избранное
              </Button>
              <Button onClick={() => setQueueOpen(true)}>Очередь</Button>
              <Button component={Link} href="/upload">
                Загрузить трек
              </Button>
            </Stack>
          </Section>
          {viewer.user ? (
            <Personal key={viewer.user.id} releases={releases} />
          ) : (
            !viewer.loading && (
              <Section title="Ваша музыкальная история">
                <Typography variant="body2" color="text.secondary">
                  Войдите, чтобы сохранять музыку и находить друзей.
                </Typography>
                <Button component={Link} href="/login" sx={{ mt: 1 }}>
                  Войти
                </Button>
              </Section>
            )
          )}
        </Stack>
      </Box>
      <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
    </Box>
  )
}
