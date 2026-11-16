'use client'
import { useText } from '@/i18n/LocaleProvider'
import { useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
import Link from 'next/link'
import { NotificationIndicator } from '@/features/notifications/NotificationIndicator'
import { useViewer } from './ViewerProvider'

export function SessionControls() {
  const lt = useText()

  const { user, loading, error, refresh, confirmed } = useViewer()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  if (loading) return <Typography variant="caption">{lt('checkingSession')}</Typography>
  if (!user) return <Stack>{error && <Typography variant="caption">{lt('sessionUnavailable')}<Button onClick={refresh}>{lt('checkSession')}</Button></Typography>}<Button component={Link} href="/login">{lt('signIn')}</Button></Stack>
  async function logout() {
    setPending(true)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Gurach-Request': '1' } })
      if (!response.ok) throw new Error('Logout failed')
      window.location.replace('/tracks')
    } catch { setFailed(true); setPending(false) }
  }
  return <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1, flexWrap: 'wrap' }}>
    {confirmed && <NotificationIndicator />}
    <Button component={Link} href="/playlists">{lt('playlists')}</Button>
    <Button component={Link} href="/account" aria-label={lt('myAccount')}>{user.displayName}</Button>
    <Button disabled={pending} onClick={() => void logout()}>{pending ? lt('signingOut') : lt('signOut')}</Button>
    {error && <Typography variant="caption">{lt('yourSessionCouldNotBeConfirmed')}<Button onClick={refresh}>{lt('checkSession')}</Button></Typography>}
    {failed && <Alert severity="error">{lt('couldNotSignOutTryAgain')}</Alert>}
  </Stack>
}
