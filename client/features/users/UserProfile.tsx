'use client'
import { message as localMessage } from '@/i18n/messages'
import { useLocale, useText, useMessage } from '@/i18n/LocaleProvider'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { Alert, Avatar, Button, Paper, Stack, Typography } from '@mui/material'
import { useViewer } from '@/features/auth/ViewerProvider'
import { getUserProfile, SocialApiError, type UserProfile as Profile } from '@/features/friends/api'
import { useFriendAction } from '@/features/friends/hooks'
import { FriendActions, friendLabels } from '@/features/friends/components/FriendActions'
function ProfileContent({ username }: { username: string }) {
  const resolve = useMessage()

  const { locale } = useLocale()

  const lt = useText()

  const [version, setVersion] = useState(0)
  const key = `${username}:${version}`
  const [state, setState] = useState<{ key: string; profile: Profile | null; error: string | null; expired: boolean }>({ key: '', profile: null, error: null, expired: false })
  const actions = useFriendAction(() => setVersion((old) => old + 1))
  useEffect(() => {
    const controller = new AbortController()
    void getUserProfile(username, controller.signal).then((profile) => { if (!controller.signal.aborted) setState({ key, profile, error: null, expired: false }) })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ key, profile: null, error: error instanceof SocialApiError && error.status === 404 ? localMessage('userNotFound') : error instanceof Error ? error.message : localMessage('networkError'), expired: error instanceof SocialApiError && error.status === 401 })
      })
    return () => controller.abort()
  }, [username, key])
  const profile = state.key === key ? state.profile : null
  const expired = state.expired || actions.expired
  return <Stack spacing={2}>
    {actions.error && <Alert severity="error">{resolve(actions.error)}</Alert>}
    {expired ? <Button component={Link} href={`/login?returnTo=${encodeURIComponent(`/users/${username}`)}`}>{lt('sessionExpiredSignInAgain')}</Button> : state.key !== key ? <Typography role="status">{lt('loading162')}</Typography> : state.error ? <Alert severity="error" action={<Button onClick={() => setVersion((old) => old + 1)}>{lt('tryAgain')}</Button>}>{resolve(state.error)}</Alert> : profile && <Paper variant="outlined" sx={{ p: 0, border: 0, bgcolor: 'transparent' }}>
      <Stack spacing={2} sx={{ alignItems: 'flex-start', overflowWrap: 'anywhere' }}>
        <Avatar sx={{ width: 64, height: 64 }} aria-hidden="true">{(profile.displayName || profile.username).slice(0, 1).toUpperCase()}</Avatar>
        <PageHeader title={profile.displayName} />
        <Typography color="text.secondary">@{profile.username}</Typography>
        <Typography>{profile.relationship.status === 'none' ? lt('youAreNotFriendsYet') : resolve(friendLabels[profile.relationship.status])}</Typography>
        {profile.relationship.friendsSince && <Typography variant="body2" color="text.secondary">{lt('friendsSince', { date: new Date(profile.relationship.friendsSince).toLocaleDateString(locale) })}</Typography>}
        <FriendActions profile={profile} pending={actions.pending.includes(profile.id)} onAction={(profile, action) => void actions.run(profile, action)} />
      </Stack>
    </Paper>}
  </Stack>
}
export function UserProfile({ username }: { username: string }) {
  const lt = useText()

  const { user, loading, error } = useViewer()
  return <Stack spacing={3} sx={{ maxWidth: 760, minWidth: 0 }}>
    {loading ? <Typography role="status">{lt('checkingSession')}</Typography> : error ? <Alert severity="error">{lt('couldNotCheckYourSessionRefreshThePage')}</Alert> : user ? <ProfileContent key={`${user.id}:${username}`} username={username} /> : <Button component={Link} href={`/login?returnTo=${encodeURIComponent(`/users/${username}`)}`}>{lt('signIn')}</Button>}
  </Stack>
}
