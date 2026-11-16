'use client'
import { useText, useMessage } from '@/i18n/LocaleProvider'
import { message as localMessage } from '@/i18n/messages'
import { useState } from 'react'
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Menu, MenuItem, Stack } from '@mui/material'
import type { FriendStatus, UserProfile } from '../api'
import type { FriendAction } from '../hooks'
export const friendLabels: Record<FriendStatus, string> = {
  self: localMessage('thisIsYou'), none: localMessage('addFriend'), incoming: localMessage('incomingRequest'), outgoing: localMessage('awaitingResponse'), friends: localMessage('friends171'), blocked_by_me: localMessage('blocked172'), unavailable: localMessage('unavailable'),
}
export type FriendActionsProps = { profile: UserProfile; pending: boolean; onAction: (profile: UserProfile, action: FriendAction) => void }
export function FriendActions({ profile, pending, onAction }: FriendActionsProps) {
  const resolve = useMessage()

  const lt = useText()

  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [confirmation, setConfirmation] = useState<{ profile: UserProfile; action: 'remove' | 'block' } | null>(null)
  const status = profile.relationship.status
  if (status === 'self' || status === 'unavailable') return <Chip label={resolve(friendLabels[status])} size="small" />
  const confirm = (action: 'remove' | 'block') => { setAnchor(null); setConfirmation({ profile, action }) }
  return <>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }} aria-busy={pending}>
      {status === 'none' && <Button variant="outlined" disabled={pending} onClick={() => onAction(profile, 'send')}>{lt('addFriend')}</Button>}
      {status === 'incoming' && <>
        <Button variant="contained" disabled={pending} onClick={() => onAction(profile, 'accept')}>{lt('accept')}</Button>
        <Button disabled={pending} onClick={() => onAction(profile, 'cancel')}>{lt('decline')}</Button>
      </>}
      {status === 'outgoing' && <>
        <Chip label={lt('awaitingResponse')} size="small" />
        <Button disabled={pending} onClick={() => onAction(profile, 'cancel')}>{lt('cancelRequest')}</Button>
      </>}
      {status === 'blocked_by_me' ? <Button variant="outlined" disabled={pending} onClick={() => onAction(profile, 'unblock')}>{lt('unblock')}</Button> : <>
        <Button aria-label={status === 'friends' ? lt('actionsForFriend', { p0: profile.displayName }) : lt('moreActions', { p0: profile.displayName })} aria-haspopup="menu" aria-expanded={Boolean(anchor)} disabled={pending} onClick={(event) => setAnchor(event.currentTarget)}>{status === 'friends' ? lt('friends180') : lt('more')}</Button>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
          {status === 'friends' && <MenuItem onClick={() => confirm('remove')}>{lt('removeFriend')}</MenuItem>}
          <MenuItem onClick={() => confirm('block')}>{lt('block')}</MenuItem>
        </Menu>
      </>}
    </Stack>
    <Dialog open={Boolean(confirmation)} onClose={() => setConfirmation(null)} fullWidth maxWidth="xs" aria-labelledby="friend-confirm-title">
      <DialogTitle id="friend-confirm-title">{confirmation?.action === 'remove' ? lt('removeThisFriend') : lt('blockThisUser')}</DialogTitle>
      <DialogContent><DialogContentText>{confirmation?.profile.displayName}: {confirmation?.action === 'remove' ? lt('yourFriendshipWillEndYouCanSendAnotherRequest') : lt('yourFriendshipAndAnyActiveRequestWillEndUnblocking')}</DialogContentText></DialogContent>
      <DialogActions>
        <Button onClick={() => setConfirmation(null)}>{lt('cancel')}</Button>
        <Button disabled={pending} onClick={() => { if (confirmation) onAction(confirmation.profile, confirmation.action); setConfirmation(null) }}>{lt('confirm')}</Button>
      </DialogActions>
    </Dialog>
  </>
}
