'use client'
import { useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
import Link from 'next/link'
import { useViewer } from './ViewerProvider'

export function SessionControls() {
  const { user, loading, error } = useViewer()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  if (loading) return <Typography variant="caption">Проверяем сессию…</Typography>
  if (!user) return <Stack>{error && <Typography variant="caption">Сессия недоступна</Typography>}<Button component={Link} href="/login">Войти</Button></Stack>
  async function logout() {
    setPending(true)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Gurach-Request': '1' } })
      if (!response.ok) throw new Error('Logout failed')
      window.location.replace('/tracks')
    } catch { setFailed(true); setPending(false) }
  }
  return <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1, flexWrap: 'wrap' }}>
    <Button component={Link} href="/account" aria-label="Мой аккаунт">{user.displayName}</Button>
    <Button disabled={pending} onClick={() => void logout()}>{pending ? 'Выходим…' : 'Выйти'}</Button>
    {failed && <Alert severity="error">Не удалось выйти. Повторите попытку.</Alert>}
  </Stack>
}
