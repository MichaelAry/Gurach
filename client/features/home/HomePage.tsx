'use client'
import { useTranslations } from '@/i18n/LocaleProvider'
import type { components } from '@/lib/api/schema'
import { useViewer } from '@/features/auth/ViewerProvider'
import { useFavorites } from '@/features/favorites/FavoritesProvider'
import { useListenRevision } from '@/features/tracks/components/ListenCountsProvider'
import { usePlayer } from '@/features/player/PlayerProvider'
import { QueuePanel } from '@/features/queue/components/QueuePanel'
import { Box, Button, LinearProgress, Stack, Typography } from '@mui/material'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ActivityFeed } from './ActivityFeed'
import { BlockState } from './BlockState'
import { MusicRows, Section } from './MusicSection'
import { useHomeBlock } from './useHomeBlock'

type HomeReleasesPage = components['schemas']['HomeReleasesPage']
type ReleasesBlock = ReturnType<typeof useHomeBlock<HomeReleasesPage>>

function Discovery() {
  const t = useTranslations('home')
  const listenRevision = useListenRevision()
  const { revision } = useFavorites()
  const block = useHomeBlock<components['schemas']['HomeDiscoveryResponse']>(
    '/api/home/discovery',
    `${listenRevision}:${revision}`,
  )
  return (
    <>
      <Typography component="h3" variant="subtitle1" sx={{ mt: 2 }}>
        {t('forYou')}
      </Typography>
      <BlockState {...block} />
      {block.data && (
        <>
          <Typography variant="body2" color="text.secondary">
            {t(
              block.data.basis === 'artists'
                ? 'discoveryArtists'
                : block.data.basis === 'no-signal'
                  ? 'discoveryNoSignal'
                  : 'discoveryNoMatches',
            )}
          </Typography>
          <MusicRows tracks={block.data.items} />
          {!block.data.items.length && <Link href="/tracks">{t('catalog')}</Link>}
        </>
      )}
    </>
  )
}

function ContinueListening() {
  const t = useTranslations('home')
  const player = usePlayer()
  const viewer = useViewer()
  return (
    <Section title={t('continue')}>
      {player.current ? (
        <>
          <MusicRows tracks={[player.current]} />
          <LinearProgress
            aria-label={t('playbackProgress')}
            variant="determinate"
            value={
              player.duration > 0 ? Math.min(100, (player.currentTime / player.duration) * 100) : 0
            }
            sx={{ mt: 1.5 }}
          />
          <Button disabled={player.pending} onClick={player.toggle} sx={{ mt: 1 }}>
            {player.playing ? t('pause') : t('resume')}
          </Button>
        </>
      ) : (
        <Typography color="text.secondary">
          {t('continueEmpty')} <Link href="/tracks">{t('catalog')}</Link>
        </Typography>
      )}
      {viewer.user && !viewer.error ? (
        <Discovery />
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('guestDescription')} <Link href="/login">{t('signIn')}</Link>
        </Typography>
      )}
    </Section>
  )
}

function Releases({ block }: { block: ReleasesBlock }) {
  const t = useTranslations('home')
  const [cursor, setCursor] = useState<string | null>(null)
  const [page, setPage] = useState<HomeReleasesPage>({ items: [], nextCursor: null })
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
      .then(async (response): Promise<HomeReleasesPage> => {
        if (!response.ok) throw new Error()
        return response.json()
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
    <Section title={t('releases')} href="/tracks">
      <BlockState {...block} />
      <MusicRows tracks={tracks} />
      {block.data?.items.length === 0 && (
        <Typography color="text.secondary">{t('releasesEmpty')}</Typography>
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
          {t('more')}
        </Button>
      )}
    </Section>
  )
}
export default function HomePage() {
  const viewer = useViewer()
  if (viewer.loading)
    return (
      <Box sx={{ width: '100%', p: 3 }}>
        <LinearProgress aria-label="Загрузка главной страницы" />
      </Box>
    )
  return <HomeContent />
}

function HomeContent() {
  const t = useTranslations('home')
  const viewer = useViewer()
  const releases = useHomeBlock<HomeReleasesPage>('/api/home/releases')
  const [queueOpen, setQueueOpen] = useState(false)
  return (
    <Box
      data-home-page
      sx={{ maxWidth: 1000, mx: 'auto', px: { xs: 2, md: 3 }, py: { xs: 2, md: 4 } }}
    >
      <Typography variant="overline" color="text.secondary">
        GURACH / MUSIC
      </Typography>
      <Typography component="h1" variant="h4" sx={{ mb: 1 }}>
        {t('hero')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {viewer.user ? `${viewer.user.displayName}, ${t('greeting')}` : t('tagline')}
      </Typography>
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Button component={Link} href="/tracks">
          {t('catalog')}
        </Button>
        <Button component={Link} href="/favorites">
          {t('favorites')}
        </Button>
        <Button onClick={() => setQueueOpen(true)}>{t('queue')}</Button>
        <Button component={Link} href="/upload">
          {t('upload')}
        </Button>
      </Stack>
      <Stack spacing={2}>
        <ContinueListening />
        {viewer.user && viewer.confirmed && <ActivityFeed key={viewer.user.id} />}
        <Releases block={releases} />
      </Stack>
      <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
    </Box>
  )
}
