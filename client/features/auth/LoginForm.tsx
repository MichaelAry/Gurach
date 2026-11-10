'use client'
import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Alert, Button, Card, Stack, TextField, Typography } from '@mui/material'
import Link from 'next/link'
import { safeReturnPath } from './return-path'

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json', 'X-Gurach-Request': '1' },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) {
        setError(response.status === 401 ? 'Неверное имя пользователя или пароль.' : response.status === 403 ? 'Вход с этого адреса запрещён.' : response.status === 429 ? 'Слишком много попыток. Попробуйте через минуту.' : 'Не удалось войти. Попробуйте позже.')
        return
      }
      setPassword('')
      router.replace(safeReturnPath(params.get('returnTo')))
      router.refresh()
    } catch { setError('Не удалось связаться с сервером. Проверьте соединение.') }
    finally { setPending(false) }
  }
  return <Card sx={{ p: 3, maxWidth: 420, width: '100%' }}>
    <Stack component="form" onSubmit={submit} spacing={2}>
      <Typography component="h1" variant="h4">Вход</Typography>
      {params.get('registered') === '1' && <Alert severity="success">Аккаунт создан. Войдите с вашим именем пользователя и паролем.</Alert>}
      <TextField label="Имя пользователя" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={pending} slotProps={{ htmlInput: { maxLength: 32 } }} />
      <TextField label="Пароль" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={pending} />
      {error && <Alert severity="error">{error}</Alert>}
      <Button type="submit" variant="contained" disabled={pending}>{pending ? 'Входим…' : 'Войти'}</Button>
      <Button component={Link} href="/register">Зарегистрироваться</Button>
      <Button component={Link} href="/tracks">Вернуться к трекам</Button>
    </Stack>
  </Card>
}
