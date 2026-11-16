'use client'
import { useText, useMessage } from '@/i18n/LocaleProvider'
import { message as localMessage } from '@/i18n/messages'
import { useState } from 'react'
import Link from 'next/link'
import { Alert, Button, Stack, Tab, Tabs, Typography } from '@mui/material'
import { useViewer } from '@/features/auth/ViewerProvider'
import type { ListKind } from './api'
import { affectedLists, useFriendAction, useFriendRequests, useFriends, useFriendsSummary } from './hooks'
import { FriendCard } from './components/FriendCard'
import { FriendRequestCard } from './components/FriendRequestCard'
import { UserSearch } from './components/UserSearch'

const tabs: { kind: ListKind; label: string; empty: string }[] = [
  { kind: 'friends', label: localMessage('myFriends'), empty: localMessage('noFriendsYetFindSomeoneAndSendARequest') },
  { kind: 'incoming', label: localMessage('incoming'), empty: localMessage('noIncomingRequests') },
  { kind: 'outgoing', label: localMessage('outgoing'), empty: localMessage('noOutgoingRequests') },
  { kind: 'blocks', label: localMessage('blocked'), empty: localMessage('noBlockedUsers') },
]
function FriendsContent() {
  const resolve = useMessage()

  const lt = useText()

  const [kind, setKind] = useState<ListKind>('friends')
  const [versions, setVersions] = useState<Record<ListKind, number>>({ friends: 0, incoming: 0, outgoing: 0, blocks: 0 })
  const [revision, setRevision] = useState(0)
  const summary = useFriendsSummary(revision)
  const actions = useFriendAction((profile, action, conflict) => {
    const affected = conflict ? tabs.map((tab) => tab.kind) : affectedLists(profile.relationship.status, action)
    setVersions((old) => Object.fromEntries(tabs.map((tab) => [tab.kind, old[tab.kind] + (affected.includes(tab.kind) ? 1 : 0)])) as Record<ListKind, number>)
    setRevision((old) => old + 1)
  })
  const counts = summary.data ? [summary.data.friendsCount, summary.data.incomingRequestsCount, summary.data.outgoingRequestsCount, summary.data.blockedUsersCount] : []
  return <Stack spacing={3}>
    {actions.error && <Alert severity="error">{resolve(actions.error)}</Alert>}
    {actions.expired ? <Button component={Link} href="/login?returnTo=/friends">{lt('sessionExpiredSignInAgain')}</Button> : <>
      <UserSearch revision={revision} pending={actions.pending} onAction={(profile, action) => void actions.run(profile, action)} />
      {summary.error && <Alert severity="error" action={<Button onClick={() => setRevision((old) => old + 1)}>{lt('tryAgain')}</Button>}>{resolve(summary.error)}</Alert>}
      <Tabs value={kind} onChange={(_, value: ListKind) => setKind(value)} aria-label={lt('friendSections')} sx={{ '& .MuiTabs-list': { flexWrap: 'wrap' }, '& .MuiTabs-indicator': { display: 'none' }, '& .MuiTab-root': { minWidth: 0, minHeight: 48, px: 1, flex: { xs: '1 1 45%', sm: '1 1 auto' }, borderRadius: 2 }, '& .Mui-selected': { bgcolor: 'action.selected' } }}>
        {tabs.map((tab, index) => <Tab key={tab.kind} value={tab.kind} label={`${resolve(tab.label)}${counts[index] !== undefined ? ` (${counts[index]})` : ''}`} id={`friends-tab-${tab.kind}`} aria-controls={`friends-panel-${tab.kind}`} />)}
      </Tabs>
      <FriendsList key={`${kind}:${versions[kind]}`} kind={kind} actions={actions} />
    </>}
  </Stack>
}
function FriendsList({ kind, actions }: { kind: ListKind; actions: ReturnType<typeof useFriendAction> }) {
  return kind === 'incoming' || kind === 'outgoing' ? <RequestList direction={kind} actions={actions} /> : <ConnectionList kind={kind} actions={actions} />
}
function ConnectionList({ kind, actions }: { kind: 'friends' | 'blocks'; actions: ReturnType<typeof useFriendAction> }) {
  const page = useFriends(kind)
  return <ListContent kind={kind} page={page} actions={actions} />
}
function RequestList({ direction, actions }: { direction: 'incoming' | 'outgoing'; actions: ReturnType<typeof useFriendAction> }) {
  const page = useFriendRequests(direction)
  return <ListContent kind={direction} page={page} actions={actions} />
}
function ListContent({ kind, page, actions }: { kind: ListKind; page: ReturnType<typeof useFriends>; actions: ReturnType<typeof useFriendAction> }) {
  const resolve = useMessage()

  const lt = useText()

  const Card = kind === 'incoming' || kind === 'outgoing' ? FriendRequestCard : FriendCard
  return <Stack spacing={2} role="tabpanel" id={`friends-panel-${kind}`} aria-labelledby={`friends-tab-${kind}`}>
    {page.error && <Alert severity="error" action={<Button onClick={page.refresh}>{lt('tryAgain')}</Button>}>{resolve(page.error)}</Alert>}
    {page.expired && <Button component={Link} href="/login?returnTo=/friends">{lt('signInAgain')}</Button>}
    {page.pending && <Typography role="status">{lt('loading162')}</Typography>}
    {!page.pending && !page.error && !page.items.length && <Typography color="text.secondary">{resolve(tabs.find((tab) => tab.kind === kind)?.empty)}</Typography>}
    {page.items.map((profile) => <Card key={profile.id} profile={profile} pending={actions.pending.includes(profile.id)} onAction={(profile, action) => void actions.run(profile, action)} />)}
    {page.nextCursor && <Button variant="outlined" disabled={page.pending} onClick={page.loadMore}>{lt('showMore')}</Button>}
  </Stack>
}
export function FriendsPage() {
  const lt = useText()

  const { user, loading, error } = useViewer()
  return <Stack spacing={3} sx={{ p: { xs: 2, sm: 3 }, pr: { xs: 8, sm: 9 } }}>
    <Typography component="h1" variant="h5">{lt('friends')}</Typography>
    {loading ? <Typography role="status">{lt('checkingSession')}</Typography> : error ? <Alert severity="error">{lt('couldNotCheckYourSessionRefreshThePage')}</Alert> : user ? <FriendsContent key={user.id} /> : <Button component={Link} href="/login?returnTo=/friends">{lt('signIn')}</Button>}
  </Stack>
}
