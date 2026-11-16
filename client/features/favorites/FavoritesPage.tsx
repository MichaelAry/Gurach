'use client'
import { useText } from '@/i18n/LocaleProvider'

import Link from 'next/link'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { useViewer } from '@/features/auth/ViewerProvider'
import { AccountTracks } from '@/features/account/AccountTracks'
import { useFavorites } from './FavoritesProvider'

export function FavoritesPage() {
  const lt = useText()

  const { user, loading, error } = useViewer()
  const { revision } = useFavorites()
  return <Stack spacing={3} sx={{ p: { xs: 2, sm: 3 } }}>
    <Typography component="h1" variant="h5">{lt('favoriteTracks')}</Typography>
    {loading ? <Typography role="status">{lt('checkingSession')}</Typography>
      : error ? <Alert severity="error">{lt('couldNotCheckYourSessionRefreshThePage')}</Alert>
      : !user ? <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Typography color="text.secondary">{lt('signInToSaveYourFavoriteTracksAndListen')}</Typography>
        <Button component={Link} href="/login?returnTo=/favorites" variant="outlined">{lt('signIn')}</Button>
      </Stack> : <AccountTracks key={user.id} kind="favorites" revision={revision} />}
  </Stack>
}
