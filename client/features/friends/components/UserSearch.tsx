'use client'
import { useText, useMessage } from '@/i18n/LocaleProvider'
import { useState } from 'react'
import Link from 'next/link'
import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import { useUserSearch, type FriendAction } from '../hooks'
import type { UserProfile } from '../api'
import { FriendCard } from './FriendCard'
export function UserSearch({ revision, pending, onAction }: { revision: number; pending: string[]; onAction: (profile: UserProfile, action: FriendAction) => void }) {
  const resolve = useMessage()

  const lt = useText()

  const [query, setQuery] = useState('')
  const search = useUserSearch(query, revision)
  const normalized = query.trim()
  const valid = /^[a-z0-9_]{2,32}$/i.test(normalized)
  return <Stack spacing={2} component="section" aria-label={lt('findPeople')}>
    <TextField fullWidth label={lt('findAUser')} placeholder={lt('enterAUsername')} value={query} onChange={(event) => setQuery(event.target.value)} slotProps={{ htmlInput: { maxLength: 32 } }} helperText={normalized && !valid ? lt('enterLatinLettersDigitsOrUnderscores') : lt('searchByUsernamePrefix')} />
    {search.error && <Alert severity="error" action={<Button onClick={search.refresh}>{lt('tryAgain')}</Button>}>{resolve(search.error)}</Alert>}
    {search.expired && <Button component={Link} href="/login?returnTo=/friends">{lt('signInAgain')}</Button>}
    {valid && <>
      {search.pending && <Typography role="status">{lt('searchingForUsers')}</Typography>}
      {!search.pending && !search.error && !search.items.length && <Typography color="text.secondary">{lt('userNotFound')}</Typography>}
      {search.items.map((profile) => <FriendCard key={profile.id} profile={profile} pending={pending.includes(profile.id)} onAction={onAction} />)}
      {search.nextCursor && <Button disabled={search.pending} onClick={search.loadMore}>{lt('showMore')}</Button>}
    </>}
  </Stack>
}
