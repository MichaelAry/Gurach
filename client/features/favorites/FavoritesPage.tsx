'use client'

import Link from 'next/link'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { useViewer } from '@/features/auth/ViewerProvider'
import { AccountTracks } from '@/features/account/AccountTracks'
import { useFavorites } from './FavoritesProvider'

export function FavoritesPage() {
  const { user, loading, error } = useViewer()
  const { revision } = useFavorites()
  return <Stack spacing={3} sx={{ p: { xs: 2, sm: 3 } }}>
    <Typography component="h1" variant="h5">Избранные треки</Typography>
    {loading ? <Typography role="status">Проверяем сессию…</Typography>
      : error ? <Alert severity="error">Не удалось проверить сессию. Обновите страницу.</Alert>
      : !user ? <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Typography color="text.secondary">Войдите, чтобы сохранять любимые треки и слушать их на любом устройстве.</Typography>
        <Button component={Link} href="/login?returnTo=/favorites" variant="outlined">Войти</Button>
      </Stack> : <AccountTracks key={user.id} kind="favorites" revision={revision} />}
  </Stack>
}
