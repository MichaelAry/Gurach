'use client'
import { useText, useMessage } from '@/i18n/LocaleProvider'
import { message as localMessage } from '@/i18n/messages'
import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Alert, Button, Card, Stack, TextField, Typography } from '@mui/material'
import Link from 'next/link'
import { safeReturnPath } from './return-path'

export function LoginForm() {
  const resolve = useMessage()

  const lt = useText()

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
        setError(response.status === 401 ? localMessage('incorrectUsernameOrPassword') : response.status === 403 ? localMessage('signInIsNotAllowedFromThisAddress') : response.status === 429 ? localMessage('tooManyAttemptsTryAgainInAMinute') : localMessage('couldNotSignInTryAgainLater'))
        return
      }
      window.dispatchEvent(new Event('gurach:session'))
      setPassword('')
      router.replace(safeReturnPath(params.get('returnTo')))
      router.refresh()
    } catch { setError(localMessage('couldNotReachTheServerCheckYourConnection')) }
    finally { setPending(false) }
  }
  return <Card sx={{ p: 3, maxWidth: 420, width: '100%' }}>
    <Stack component="form" onSubmit={submit} spacing={2}>
      <Typography component="h1" variant="h4">{lt('signIn115')}</Typography>
      {params.get('registered') === '1' && <Alert severity="success">{lt('accountCreatedSignInWithYourUsernameAndPassword')}</Alert>}
      <TextField label={lt('username')} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={pending} slotProps={{ htmlInput: { maxLength: 32 } }} />
      <TextField label={lt('password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={pending} />
      {error && <Alert severity="error">{resolve(error)}</Alert>}
      <Button type="submit" variant="contained" disabled={pending}>{pending ? lt('signingIn') : lt('signIn')}</Button>
      <Button component={Link} href="/register">{lt('createAnAccount118')}</Button>
      <Button component={Link} href="/tracks">{lt('backToTracks119')}</Button>
    </Stack>
  </Card>
}
