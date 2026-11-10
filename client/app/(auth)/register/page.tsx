'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Alert, Button, Card, Stack, TextField, Typography } from '@mui/material'

export default function RegisterPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return
    if (!displayName.trim()) { setError('Отображаемое имя не должно состоять только из пробелов.'); return }
    const passwordLength = Array.from(password).length
    if (passwordLength < 8 || passwordLength > 128 || new TextEncoder().encode(password).length > 512) { setError('Пароль должен содержать от 8 до 128 символов и занимать не более 512 байт UTF-8.'); return }
    setPending(true); setError('')
    try {
      const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Gurach-Request': '1' }, body: JSON.stringify({ username, displayName: displayName.trim(), password }) })
      if (!response.ok) { setError(response.status === 409 ? 'Это имя пользователя уже занято.' : response.status === 429 ? 'Слишком много попыток. Попробуйте позже.' : response.status === 400 ? 'Проверьте имя, отображаемое имя и пароль (не менее 8 символов).' : 'Не удалось создать аккаунт. Попробуйте позже.'); return }
      // The login endpoint installs the existing HttpOnly session cookie.
      try {
        const login = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Gurach-Request': '1' }, body: JSON.stringify({ username, password }) })
        setPassword('')
        router.replace(login.ok ? '/tracks' : '/login?registered=1')
      } catch {
        setPassword('')
        router.replace('/login?registered=1')
      }
      router.refresh()
    } catch { setError('Не удалось связаться с сервером. Проверьте соединение.') }
    finally { setPending(false) }
  }
  return <Card sx={{ p: 3, maxWidth: 420, width: '100%' }}><Stack component="form" onSubmit={submit} spacing={2}>
    <Typography component="h1" variant="h4">Регистрация</Typography>
    <TextField label="Имя пользователя" helperText="3–32 латинские буквы, цифры или _. Регистр не учитывается." autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required disabled={pending} slotProps={{ htmlInput: { minLength: 3, maxLength: 32, pattern: '[A-Za-z0-9_]+' } }} />
    <TextField label="Отображаемое имя" helperText="От 1 до 64 символов. Имя не должно состоять только из пробелов." autoComplete="name" value={displayName} onChange={e => setDisplayName(e.target.value)} required disabled={pending} slotProps={{ htmlInput: { maxLength: 64 } }} />
    <TextField label="Пароль" helperText="От 8 до 128 символов, включая пробелы и эмодзи." type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={pending} />
    {error && <Alert severity="error">{error}</Alert>}
    <Button type="submit" variant="contained" disabled={pending}>{pending ? 'Создаём…' : 'Создать аккаунт'}</Button>
    <Button component={Link} href="/login">Уже есть аккаунт? Войти</Button>
  </Stack></Card>
}
