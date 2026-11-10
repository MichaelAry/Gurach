'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Alert, Avatar, Box, Button, Paper, Stack, Typography } from '@mui/material'
import { getFriends, SocialApiError, type FriendListPage } from '@/features/friends/api'

export function AccountFriends({ revision }: { revision: number }) {
  const [attempt, setAttempt] = useState(0)
  const key = `${revision}:${attempt}`
  const [state, setState] = useState<{ key: string; data: FriendListPage | null; error: string | null; expired: boolean }>({ key: '', data: null, error: null, expired: false })

  useEffect(() => {
    const controller = new AbortController()
    void getFriends(null, controller.signal, 5).then((data) => {
      if (!controller.signal.aborted) setState({ key, data, error: null, expired: false })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ key, data: null, error: error instanceof Error ? error.message : 'Не удалось загрузить друзей.', expired: error instanceof SocialApiError && error.status === 401 })
    })
    return () => controller.abort()
  }, [key])

  const current = state.key === key
  const items = current ? state.data?.items ?? [] : []

  return (
    <Paper component="section" aria-labelledby="account-friends" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2} aria-busy={!current}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Typography id="account-friends" component="h2" variant="h6">Друзья</Typography>
          <Button component={Link} href="/friends" variant="outlined">Все друзья</Button>
        </Stack>
        {!current ? <Typography role="status" color="text.secondary">Загружаем друзей…</Typography>
          : state.error ? <Alert severity="error" action={state.expired ? <Button component={Link} href="/login?returnTo=/account">Войти</Button> : <Button onClick={() => setAttempt((old) => old + 1)}>Повторить</Button>}>{state.error}</Alert>
          : !items.length ? <Typography color="text.secondary">Пока нет друзей. Найдите пользователей в разделе «Друзья».</Typography>
          : <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {items.map((friend) => (
              <Box component="li" key={friend.id}>
                <Stack component={Link} href={`/users/${encodeURIComponent(friend.username)}`} direction="row" spacing={1.5} sx={{ alignItems: 'center', minHeight: 48, p: 1, borderRadius: 2, color: 'text.primary', textDecoration: 'none', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 2 } }}>
                  <Avatar aria-hidden="true">{(friend.displayName || friend.username).slice(0, 1).toUpperCase()}</Avatar>
                  <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <Typography sx={{ fontWeight: 600 }}>{friend.displayName}</Typography>
                    <Typography variant="body2" color="text.secondary">@{friend.username}</Typography>
                  </Box>
                </Stack>
              </Box>
            ))}
          </Stack>}
      </Stack>
    </Paper>
  )
}
