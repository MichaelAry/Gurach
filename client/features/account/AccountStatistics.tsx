'use client'

import { useState } from 'react'
import { useFriendsSummary } from '@/features/friends/hooks'
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material'
import type { AccountStatistics as Statistics } from './api'
import { useAccountData } from './useAccountData'
import { useFavorites } from '@/features/favorites/FavoritesProvider'

const metrics: { key: keyof Statistics | 'favoriteTracks' | 'friendsCount'; label: string }[] = [
  { key: 'uploadedTracks', label: 'Загружено треков' },
  { key: 'totalListens', label: 'Прослушано треков' },
  { key: 'uniqueTracks', label: 'Уникальных треков прослушано' },
  { key: 'receivedListens', label: 'Прослушиваний моих загрузок' },
  { key: 'comments', label: 'Оставлено комментариев' },
  { key: 'favoriteTracks', label: 'Избранных треков' },
  { key: 'friendsCount', label: 'Друзей' },
]

export function AccountStatistics({ revision, friendsRevision }: { revision: number; friendsRevision: number }) {
  const [friendsAttempt, setFriendsAttempt] = useState(0)
  const friends = useFriendsSummary(friendsRevision + friendsAttempt)
  const { ids, loading: favoritesLoading } = useFavorites()
  const { data, pending, error, retry } = useAccountData<Statistics>('statistics', revision)
  return (
    <Stack component="section" aria-labelledby="account-statistics" spacing={2} aria-busy={pending}>
      <Typography id="account-statistics" component="h2" variant="h6">Статистика</Typography>
      <Typography color="text.secondary" variant="body2">Личные прослушивания учитываются после 30 секунд воспроизведения, для треков короче 30 секунд — после половины. История сохраняется с момента начала учёта. Загрузки и их прослушивания показаны для доступных треков.</Typography>
      {error && <Alert severity="error" action={<Button onClick={retry}>Повторить</Button>}>{error}</Alert>}
      {friends.error && <Alert severity="error" action={<Button onClick={() => setFriendsAttempt((old) => old + 1)}>Повторить</Button>}>Не удалось загрузить число друзей. {friends.error}</Alert>}
      {pending && !data && <Typography role="status" color="text.secondary">Загружаем статистику…</Typography>}
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        {metrics.map(({ key, label }) => (
          <Paper key={key} variant="outlined" sx={{ p: 2 }}>
            <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
            <Typography component="dd" variant="h5" sx={{ m: 0, mt: 1 }}>{key === 'friendsCount' ? (friends.data?.friendsCount.toLocaleString('ru-RU') ?? '—') : key === 'favoriteTracks' ? (favoritesLoading ? '—' : ids.size.toLocaleString('ru-RU')) : data ? data[key].toLocaleString('ru-RU') : '—'}</Typography>
          </Paper>
        ))}
      </Box>
    </Stack>
  )
}
