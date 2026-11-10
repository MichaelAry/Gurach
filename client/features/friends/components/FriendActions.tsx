'use client'
import { useState } from 'react'
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Menu, MenuItem, Stack } from '@mui/material'
import type { FriendStatus, UserProfile } from '../api'
import type { FriendAction } from '../hooks'
export const friendLabels: Record<FriendStatus, string> = {
  self: 'Это вы', none: 'Добавить в друзья', incoming: 'Входящая заявка', outgoing: 'Ожидает ответа', friends: 'В друзьях', blocked_by_me: 'Заблокирован', unavailable: 'Недоступен',
}
export type FriendActionsProps = { profile: UserProfile; pending: boolean; onAction: (profile: UserProfile, action: FriendAction) => void }
export function FriendActions({ profile, pending, onAction }: FriendActionsProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [confirmation, setConfirmation] = useState<{ profile: UserProfile; action: 'remove' | 'block' } | null>(null)
  const status = profile.relationship.status
  if (status === 'self' || status === 'unavailable') return <Chip label={friendLabels[status]} size="small" />
  const confirm = (action: 'remove' | 'block') => { setAnchor(null); setConfirmation({ profile, action }) }
  return <>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }} aria-busy={pending}>
      {status === 'none' && <Button variant="outlined" disabled={pending} onClick={() => onAction(profile, 'send')}>Добавить в друзья</Button>}
      {status === 'incoming' && <>
        <Button variant="contained" disabled={pending} onClick={() => onAction(profile, 'accept')}>Принять</Button>
        <Button disabled={pending} onClick={() => onAction(profile, 'cancel')}>Отклонить</Button>
      </>}
      {status === 'outgoing' && <>
        <Chip label="Ожидает ответа" size="small" />
        <Button disabled={pending} onClick={() => onAction(profile, 'cancel')}>Отменить заявку</Button>
      </>}
      {status === 'blocked_by_me' ? <Button variant="outlined" disabled={pending} onClick={() => onAction(profile, 'unblock')}>Разблокировать</Button> : <>
        <Button aria-label={status === 'friends' ? `Действия с другом ${profile.displayName}` : `Другие действия: ${profile.displayName}`} aria-haspopup="menu" aria-expanded={Boolean(anchor)} disabled={pending} onClick={(event) => setAnchor(event.currentTarget)}>{status === 'friends' ? 'В друзьях ▾' : 'Ещё'}</Button>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
          {status === 'friends' && <MenuItem onClick={() => confirm('remove')}>Удалить из друзей</MenuItem>}
          <MenuItem onClick={() => confirm('block')}>Заблокировать</MenuItem>
        </Menu>
      </>}
    </Stack>
    <Dialog open={Boolean(confirmation)} onClose={() => setConfirmation(null)} fullWidth maxWidth="xs" aria-labelledby="friend-confirm-title">
      <DialogTitle id="friend-confirm-title">{confirmation?.action === 'remove' ? 'Удалить из друзей?' : 'Заблокировать пользователя?'}</DialogTitle>
      <DialogContent><DialogContentText>{confirmation?.profile.displayName}: {confirmation?.action === 'remove' ? 'Дружба будет прекращена. Повторная заявка станет доступна через 24 часа.' : 'Дружба и активная заявка будут прекращены. Разблокировка не восстановит дружбу.'}</DialogContentText></DialogContent>
      <DialogActions>
        <Button onClick={() => setConfirmation(null)}>Отмена</Button>
        <Button disabled={pending} onClick={() => { if (confirmation) onAction(confirmation.profile, confirmation.action); setConfirmation(null) }}>Подтвердить</Button>
      </DialogActions>
    </Dialog>
  </>
}
