'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Alert, Avatar, Button, Paper, Stack, Typography } from '@mui/material'
import { useViewer } from '@/features/auth/ViewerProvider'
import { getUserProfile, SocialApiError, type UserProfile as Profile } from '@/features/friends/api'
import { useFriendAction } from '@/features/friends/hooks'
import { FriendActions, friendLabels } from '@/features/friends/components/FriendActions'
function ProfileContent({ username }: { username: string }) {
  const [version, setVersion] = useState(0)
  const key = `${username}:${version}`
  const [state, setState] = useState<{ key: string; profile: Profile | null; error: string | null; expired: boolean }>({ key: '', profile: null, error: null, expired: false })
  const actions = useFriendAction(() => setVersion((old) => old + 1))
  useEffect(() => {
    const controller = new AbortController()
    void getUserProfile(username, controller.signal).then((profile) => { if (!controller.signal.aborted) setState({ key, profile, error: null, expired: false }) })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ key, profile: null, error: error instanceof SocialApiError && error.status === 404 ? 'Пользователь не найден.' : error instanceof Error ? error.message : 'Сетевая ошибка.', expired: error instanceof SocialApiError && error.status === 401 })
      })
    return () => controller.abort()
  }, [username, key])
  const profile = state.key === key ? state.profile : null
  const expired = state.expired || actions.expired
  return <Stack spacing={2}>
    {actions.error && <Alert severity="error">{actions.error}</Alert>}
    {expired ? <Button component={Link} href={`/login?returnTo=${encodeURIComponent(`/users/${username}`)}`}>Сессия истекла. Войти снова</Button> : state.key !== key ? <Typography role="status">Загрузка…</Typography> : state.error ? <Alert severity="error" action={<Button onClick={() => setVersion((old) => old + 1)}>Повторить</Button>}>{state.error}</Alert> : profile && <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
      <Stack spacing={2} sx={{ alignItems: 'flex-start', overflowWrap: 'anywhere' }}>
        <Avatar sx={{ width: 64, height: 64 }} aria-hidden="true">{(profile.displayName || profile.username).slice(0, 1).toUpperCase()}</Avatar>
        <Typography component="h1" variant="h5">{profile.displayName}</Typography>
        <Typography color="text.secondary">@{profile.username}</Typography>
        <Typography>{profile.relationship.status === 'none' ? 'Вы пока не друзья' : friendLabels[profile.relationship.status]}</Typography>
        {profile.relationship.friendsSince && <Typography variant="body2" color="text.secondary">Друзья с {new Date(profile.relationship.friendsSince).toLocaleDateString('ru-RU')}</Typography>}
        <FriendActions profile={profile} pending={actions.pending.includes(profile.id)} onAction={(profile, action) => void actions.run(profile, action)} />
      </Stack>
    </Paper>}
  </Stack>
}
export function UserProfile({ username }: { username: string }) {
  const { user, loading, error } = useViewer()
  return <Stack spacing={3} sx={{ p: { xs: 2, sm: 3 }, pr: { xs: 8, sm: 9 } }}>
    {loading ? <Typography role="status">Проверяем сессию…</Typography> : error ? <Alert severity="error">Не удалось проверить сессию. Обновите страницу.</Alert> : user ? <ProfileContent key={`${user.id}:${username}`} username={username} /> : <Button component={Link} href={`/login?returnTo=${encodeURIComponent(`/users/${username}`)}`}>Войти</Button>}
  </Stack>
}
