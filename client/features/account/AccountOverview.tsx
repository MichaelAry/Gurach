'use client'
import { typeRoles } from '@/theme/tokens'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useLocaleSync, useText } from '@/i18n/LocaleProvider'

import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { Alert, Avatar, Box, Button, Paper, Stack, Typography } from '@mui/material'
import { useViewer } from '@/features/auth/ViewerProvider'
import { useEffect, useState } from 'react'
import { useListenRevision } from '@/features/tracks/components/ListenCountsProvider'
import { AccountStatistics } from './AccountStatistics'
import { AccountTracks } from './AccountTracks'
import { AccountFriends } from './AccountFriends'

function AccountLanguageSettings() {
  const lt = useText()
  const { syncError, syncPending } = useLocaleSync()
  return (
    <Paper component="section" variant="outlined" sx={{ py: 3, border: 0, borderTop: '1px solid', borderColor: 'divider', borderRadius: 0, bgcolor: 'transparent' }}>
      <Stack spacing={1}>
        <Typography component="h2" sx={typeRoles.section}>{lt('languageSettings')}</Typography>
        <LanguageSwitcher />
        {!syncError && <Typography variant="body2">{lt(syncPending ? 'languageSavingAccount' : 'languageSavedAccount')}</Typography>}
      </Stack>
    </Paper>
  )
}

export function AccountOverview() {
  const lt = useText()

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
    <Stack spacing={3} sx={{ minWidth: 0 }}>
      <PageHeader title={user?.displayName ?? lt('myAccount')} eyebrow={user ? lt('myAccount') : undefined} />

      {loading ? (
        <Typography role="status" color="text.secondary">{lt('checkingSession')}</Typography>
      ) : error ? (
        <Alert severity="error">{lt('couldNotLoadYourAccountRefreshThePage')}</Alert>
      ) : !user ? (
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Typography color="text.secondary">{lt('signInToOpenYourAccount')}</Typography>
          <Button component={Link} href="/login?returnTo=/account" variant="outlined">{lt('signIn')}</Button>
        </Stack>
      ) : (
        <Stack key={user.id} spacing={3}>
          <Paper variant="outlined" sx={{ py: 3, border: 0, borderTop: '1px solid', borderColor: 'divider', borderRadius: 0, bgcolor: 'transparent' }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Avatar aria-hidden="true">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</Avatar>
              <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>

                <Typography color="text.secondary">@{user.username}</Typography>
              </Box>
            </Stack>
          </Paper>

          <AccountLanguageSettings />
          <AccountStatistics revision={revision} friendsRevision={refresh} />
          <AccountFriends revision={refresh} />
          <Button component={Link} href="/favorites" variant="outlined">{lt('favoriteTracks')}</Button>

          <Paper component="section" aria-labelledby="account-uploads" variant="outlined" sx={{ py: 3, border: 0, borderTop: '1px solid', borderColor: 'divider', borderRadius: 0, bgcolor: 'transparent' }}>
            <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
              <Typography id="account-uploads" component="h2" sx={typeRoles.section}>{lt('myUploads')}</Typography>
              <Button component={Link} href="/upload" variant="outlined">{lt('uploadTrack')}</Button>
            </Stack>
            <Box sx={{ mt: 2 }}><AccountTracks kind="uploads" revision={revision} /></Box>
          </Paper>

          <Paper component="section" aria-labelledby="account-history" variant="outlined" sx={{ py: 3, border: 0, borderTop: '1px solid', borderColor: 'divider', borderRadius: 0, bgcolor: 'transparent' }}>
            <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
              <Typography id="account-history" component="h2" sx={typeRoles.section}>{lt('recentlyPlayed')}</Typography>
              <Button component={Link} href="/tracks" variant="outlined">{lt('browseTracks')}</Button>
            </Stack>
            <Box sx={{ mt: 2 }}><AccountTracks kind="history" revision={revision} /></Box>
          </Paper>
        </Stack>
      )}
    </Stack>
  )
}
