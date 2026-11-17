'use client'
import { useText, useMessage } from '@/i18n/LocaleProvider'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'
import { message as localMessage } from '@/i18n/messages'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Alert, Button, Card, Stack, TextField, Typography } from '@mui/material'

export default function RegisterPage() {
  const resolve = useMessage()

  const lt = useText()

  const router = useRouter()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return
    if (!displayName.trim()) { setError(localMessage('theDisplayNameCannotContainOnlySpaces')); return }
    const passwordLength = Array.from(password).length
    if (passwordLength < 8 || passwordLength > 128 || new TextEncoder().encode(password).length > 512) { setError(localMessage('thePasswordMustContainCharactersAndUseNoMore')); return }
    setPending(true); setError('')
    try {
      const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Gurach-Request': '1' }, body: JSON.stringify({ username, displayName: displayName.trim(), password }) })
      if (!response.ok) { setError(response.status === 409 ? localMessage('thisUsernameIsAlreadyTaken') : response.status === 429 ? localMessage('tooManyAttemptsTryAgainLater') : response.status === 400 ? localMessage('checkTheUsernameDisplayNameAndPasswordAtLeast') : localMessage('couldNotCreateYourAccountTryAgainLater')); return }
      // The login endpoint installs the existing HttpOnly session cookie.
      try {
        const login = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Gurach-Request': '1' }, body: JSON.stringify({ username, password }) })
        setPassword('')
        window.dispatchEvent(new Event('gurach:session')); router.replace(login.ok ? '/tracks' : '/login?registered=1')
      } catch {
        setPassword('')
        window.dispatchEvent(new Event('gurach:session')); router.replace('/login?registered=1')
      }
      router.refresh()
    } catch { setError(localMessage('couldNotReachTheServerCheckYourConnection')) }
    finally { setPending(false) }
  }
  return <Card sx={{ p: 3, maxWidth: 420, width: '100%' }}><LocaleMetadata /><Stack component="form" onSubmit={submit} spacing={2}>
    <Typography component="h1" variant="h4">{lt('createAnAccount')}</Typography>
    <TextField label={lt('username')} helperText={lt('latinLettersDigitsOrCaseInsensitive')} autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required disabled={pending} slotProps={{ htmlInput: { minLength: 3, maxLength: 32, pattern: '[A-Za-z0-9_]+' } }} />
    <TextField label={lt('displayName')} helperText={lt('charactersTheNameCannotContainOnlySpaces')} autoComplete="name" value={displayName} onChange={e => setDisplayName(e.target.value)} required disabled={pending} slotProps={{ htmlInput: { maxLength: 64 } }} />
    <TextField label={lt('password')} helperText={lt('charactersIncludingSpacesAndEmoji')} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={pending} />
    {error && <Alert severity="error">{resolve(error)}</Alert>}
    <Button type="submit" variant="contained" disabled={pending}>{pending ? lt('creating') : lt('createAccount')}</Button>
    <Button component={Link} href="/login">{lt('alreadyHaveAnAccountSignIn')}</Button>
  </Stack></Card>
}
