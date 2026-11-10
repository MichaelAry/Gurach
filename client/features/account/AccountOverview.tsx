'use client'

import Link from 'next/link'
import { Alert, Avatar, Box, Button, Paper, Stack, Typography } from '@mui/material'
import { useViewer } from '@/features/auth/ViewerProvider'
import { useEffect, useState } from 'react'
import { useListenRevision } from '@/features/tracks/components/ListenCountsProvider'
import { AccountStatistics } from './AccountStatistics'
import { AccountTracks } from './AccountTracks'

export function AccountOverview() {
  const { user, loading, error } = useViewer()
  const listenRevision = useListenRevision()
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const onFocus = () => setRefresh((old) => old + 1)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
  const revision = listenRevision + refresh

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography component="h1" variant="h5">Мой аккаунт</Typography>

      {loading ? (
        <Typography role="status" color="text.secondary">Проверяем сессию…</Typography>
      ) : error ? (
        <Alert severity="error">Не удалось загрузить аккаунт. Обновите страницу.</Alert>
      ) : !user ? (
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Typography color="text.secondary">Войдите, чтобы открыть свой аккаунт.</Typography>
          <Button component={Link} href="/login?returnTo=/account" variant="outlined">Войти</Button>
        </Stack>
      ) : (
        <Stack key={user.id} spacing={3}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Avatar aria-hidden="true">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</Avatar>
              <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <Typography variant="h6" component="p">{user.displayName}</Typography>
                <Typography color="text.secondary">@{user.username}</Typography>
              </Box>
            </Stack>
          </Paper>

          <AccountStatistics revision={revision} />
          <Button component={Link} href="/favorites" variant="outlined">Избранные треки</Button>

          <Paper component="section" aria-labelledby="account-uploads" variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
              <Typography id="account-uploads" component="h2" variant="h6">Мои загрузки</Typography>
              <Button component={Link} href="/upload" variant="outlined">Загрузить трек</Button>
            </Stack>
            <Box sx={{ mt: 2 }}><AccountTracks kind="uploads" revision={revision} /></Box>
          </Paper>

          <Paper component="section" aria-labelledby="account-history" variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
              <Typography id="account-history" component="h2" variant="h6">Недавно слушал</Typography>
              <Button component={Link} href="/tracks" variant="outlined">Открыть треки</Button>
            </Stack>
            <Box sx={{ mt: 2 }}><AccountTracks kind="history" revision={revision} /></Box>
          </Paper>
        </Stack>
      )}
    </Stack>
  )
}
