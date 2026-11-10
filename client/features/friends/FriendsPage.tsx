'use client'
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
  { kind: 'friends', label: 'Мои друзья', empty: 'Пока нет друзей. Найдите пользователя и отправьте заявку.' },
  { kind: 'incoming', label: 'Входящие', empty: 'Нет входящих заявок.' },
  { kind: 'outgoing', label: 'Исходящие', empty: 'Нет исходящих заявок.' },
  { kind: 'blocks', label: 'Заблокированные', empty: 'Нет заблокированных пользователей.' },
]
function FriendsContent() {
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
    {actions.error && <Alert severity="error">{actions.error}</Alert>}
    {actions.expired ? <Button component={Link} href="/login?returnTo=/friends">Сессия истекла. Войти снова</Button> : <>
      <UserSearch revision={revision} pending={actions.pending} onAction={(profile, action) => void actions.run(profile, action)} />
      {summary.error && <Alert severity="error" action={<Button onClick={() => setRevision((old) => old + 1)}>Повторить</Button>}>{summary.error}</Alert>}
      <Tabs value={kind} onChange={(_, value: ListKind) => setKind(value)} aria-label="Разделы друзей" sx={{ '& .MuiTabs-list': { flexWrap: 'wrap' }, '& .MuiTabs-indicator': { display: 'none' }, '& .MuiTab-root': { minWidth: 0, minHeight: 48, px: 1, flex: { xs: '1 1 45%', sm: '1 1 auto' }, borderRadius: 2 }, '& .Mui-selected': { bgcolor: 'action.selected' } }}>
        {tabs.map((tab, index) => <Tab key={tab.kind} value={tab.kind} label={`${tab.label}${counts[index] !== undefined ? ` (${counts[index]})` : ''}`} id={`friends-tab-${tab.kind}`} aria-controls={`friends-panel-${tab.kind}`} />)}
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
  const Card = kind === 'incoming' || kind === 'outgoing' ? FriendRequestCard : FriendCard
  return <Stack spacing={2} role="tabpanel" id={`friends-panel-${kind}`} aria-labelledby={`friends-tab-${kind}`}>
    {page.error && <Alert severity="error" action={<Button onClick={page.refresh}>Повторить</Button>}>{page.error}</Alert>}
    {page.expired && <Button component={Link} href="/login?returnTo=/friends">Войти снова</Button>}
    {page.pending && <Typography role="status">Загрузка…</Typography>}
    {!page.pending && !page.error && !page.items.length && <Typography color="text.secondary">{tabs.find((tab) => tab.kind === kind)?.empty}</Typography>}
    {page.items.map((profile) => <Card key={profile.id} profile={profile} pending={actions.pending.includes(profile.id)} onAction={(profile, action) => void actions.run(profile, action)} />)}
    {page.nextCursor && <Button variant="outlined" disabled={page.pending} onClick={page.loadMore}>Показать ещё</Button>}
  </Stack>
}
export function FriendsPage() {
  const { user, loading, error } = useViewer()
  return <Stack spacing={3} sx={{ p: { xs: 2, sm: 3 }, pr: { xs: 8, sm: 9 } }}>
    <Typography component="h1" variant="h5">Друзья</Typography>
    {loading ? <Typography role="status">Проверяем сессию…</Typography> : error ? <Alert severity="error">Не удалось проверить сессию. Обновите страницу.</Alert> : user ? <FriendsContent key={user.id} /> : <Button component={Link} href="/login?returnTo=/friends">Войти</Button>}
  </Stack>
}
