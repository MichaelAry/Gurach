'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import { useUserSearch, type FriendAction } from '../hooks'
import type { UserProfile } from '../api'
import { FriendCard } from './FriendCard'
export function UserSearch({ revision, pending, onAction }: { revision: number; pending: string[]; onAction: (profile: UserProfile, action: FriendAction) => void }) {
  const [query, setQuery] = useState('')
  const search = useUserSearch(query, revision)
  const normalized = query.trim()
  const valid = /^[a-z0-9_]{2,32}$/i.test(normalized)
  return <Stack spacing={2} component="section" aria-label="Поиск пользователей">
    <TextField fullWidth label="Поиск пользователя" placeholder="Введите username" value={query} onChange={(event) => setQuery(event.target.value)} slotProps={{ htmlInput: { maxLength: 32 } }} helperText={normalized && !valid ? 'Введите от 2 до 32 латинских букв, цифр или символов _.' : 'Поиск по началу username'} />
    {search.error && <Alert severity="error" action={<Button onClick={search.refresh}>Повторить</Button>}>{search.error}</Alert>}
    {search.expired && <Button component={Link} href="/login?returnTo=/friends">Войти снова</Button>}
    {valid && <>
      {search.pending && <Typography role="status">Ищем пользователей…</Typography>}
      {!search.pending && !search.error && !search.items.length && <Typography color="text.secondary">Пользователь не найден.</Typography>}
      {search.items.map((profile) => <FriendCard key={profile.id} profile={profile} pending={pending.includes(profile.id)} onAction={onAction} />)}
      {search.nextCursor && <Button disabled={search.pending} onClick={search.loadMore}>Показать ещё</Button>}
    </>}
  </Stack>
}
