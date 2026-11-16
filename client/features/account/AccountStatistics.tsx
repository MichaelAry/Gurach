'use client'
import { useLocale, useText, useMessage } from '@/i18n/LocaleProvider'
import { message as localMessage } from '@/i18n/messages'

import { useState } from 'react'
import { useFriendsSummary } from '@/features/friends/hooks'
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material'
import type { AccountStatistics as Statistics } from './api'
import { useAccountData } from './useAccountData'
import { useFavorites } from '@/features/favorites/FavoritesProvider'

const metrics: { key: keyof Statistics | 'favoriteTracks' | 'friendsCount'; label: string }[] = [
  { key: 'uploadedTracks', label: localMessage('tracksUploaded') },
  { key: 'totalListens', label: localMessage('tracksPlayed') },
  { key: 'uniqueTracks', label: localMessage('uniqueTracksPlayed') },
  { key: 'receivedListens', label: localMessage('listensToMyUploads') },
  { key: 'comments', label: localMessage('commentsPosted') },
  { key: 'favoriteTracks', label: localMessage('favoriteTracks081') },
  { key: 'friendsCount', label: localMessage('friends082') },
]

export function AccountStatistics({ revision, friendsRevision }: { revision: number; friendsRevision: number }) {
  const resolve = useMessage()

  const { locale } = useLocale()

  const lt = useText()

  const [friendsAttempt, setFriendsAttempt] = useState(0)
  const friends = useFriendsSummary(friendsRevision + friendsAttempt)
  const { ids, loading: favoritesLoading } = useFavorites()
  const { data, pending, error, retry } = useAccountData<Statistics>('statistics', revision)
  return (
    <Stack component="section" aria-labelledby="account-statistics" spacing={2} aria-busy={pending}>
      <Typography id="account-statistics" component="h2" variant="h6">{lt('statistics')}</Typography>
      <Typography color="text.secondary" variant="body2">{lt('personalListensCountAfterSecondsOfPlaybackOrHalfway')}</Typography>
      {error && <Alert severity="error" action={<Button onClick={retry}>{lt('tryAgain')}</Button>}>{resolve(error)}</Alert>}
      {friends.error && <Alert severity="error" action={<Button onClick={() => setFriendsAttempt((old) => old + 1)}>{lt('tryAgain')}</Button>}>{lt('couldNotLoadTheFriendCount')}{resolve(friends.error)}</Alert>}
      {pending && !data && <Typography role="status" color="text.secondary">{lt('loadingStatistics')}</Typography>}
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        {metrics.map(({ key, label }) => (
          <Paper key={key} variant="outlined" sx={{ p: 2 }}>
            <Typography component="dt" variant="body2" color="text.secondary">{resolve(label)}</Typography>
            <Typography component="dd" variant="h5" sx={{ m: 0, mt: 1 }}>{key === 'friendsCount' ? (friends.data?.friendsCount.toLocaleString(locale) ?? '—') : key === 'favoriteTracks' ? (favoritesLoading ? '—' : ids.size.toLocaleString(locale)) : data ? data[key].toLocaleString(locale) : '—'}</Typography>
          </Paper>
        ))}
      </Box>
    </Stack>
  )
}
