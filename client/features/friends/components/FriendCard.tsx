'use client'
import Link from 'next/link'
import { Avatar, Box, Paper, Stack, Typography } from '@mui/material'
import { FriendActions, type FriendActionsProps } from './FriendActions'
export function FriendCard(props: FriendActionsProps & { requestedAt?: string | null }) {
  const { profile, requestedAt } = props
  return <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3 }}>
    <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
        <Avatar aria-hidden="true">{(profile.displayName || profile.username).slice(0, 1).toUpperCase()}</Avatar>
        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <Typography component={Link} href={`/users/${encodeURIComponent(profile.username)}`} sx={{ color: 'text.primary', textDecoration: 'none', fontWeight: 600 }}>{profile.displayName}</Typography>
          <Typography variant="body2" color="text.secondary">@{profile.username}</Typography>
          {requestedAt && <Typography component="time" dateTime={requestedAt} variant="caption" color="text.secondary">{new Date(requestedAt).toLocaleString('ru-RU')}</Typography>}
        </Box>
      </Stack>
      <FriendActions {...props} />
    </Stack>
  </Paper>
}
