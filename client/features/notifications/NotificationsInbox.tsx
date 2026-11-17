'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { Alert, Button, Paper, Stack, Typography } from '@mui/material'
import { useViewer } from '@/features/auth/ViewerProvider'
import { useLocale, useTranslations } from '@/i18n/LocaleProvider'
import type { components } from '@/lib/api/schema'
import { discussionLink } from '@/lib/discussion-link'
import { notificationsChanged } from './NotificationIndicator'

type Page = components['schemas']['NotificationsPage']
type Item = Page['items'][number]
function Inbox({ identity }: { identity: string }) {
  const { isConfirmed } = useViewer()
  const t = useTranslations('notifications')
  const { locale } = useLocale()
  const [items, setItems] = useState<Item[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [writeFailed, setWriteFailed] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const mutation = useRef<AbortController | null>(null)
  useEffect(() => () => mutation.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {
      cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
    }).then(async (response) => {
      if (!response.ok) throw new Error()
      const page: Page = await response.json()
      if (!controller.signal.aborted && isConfirmed(identity)) {
        setItems((old) => cursor ? [...new Map([...old, ...page.items].map((item) => [item.id, item])).values()] : page.items)
        setNext(page.nextCursor)
        setFailed(false)
        setLoading(false)
      }
    }).catch(() => {
      if (!controller.signal.aborted && isConfirmed(identity)) { setFailed(true); setLoading(false) }
    })
    return () => controller.abort()
  }, [identity, isConfirmed, cursor, attempt])
  async function read(item: Item) {
    if (pending || !isConfirmed(identity)) return
    const controller = new AbortController()
    mutation.current = controller
    setPending(item.id)
    setWriteFailed(false)
    try {
      const response = await fetch(`/api/notifications/${item.id}/read`, {
        method: 'PUT', headers: { 'X-Gurach-Request': '1' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      })
      if (!response.ok) throw new Error()
      if (!controller.signal.aborted && isConfirmed(identity)) {
        setItems((old) => old.map((row) => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row))
        window.dispatchEvent(new Event(notificationsChanged))
      }
    } catch {
      if (!controller.signal.aborted && isConfirmed(identity)) setWriteFailed(true)
    } finally {
      if (!controller.signal.aborted && isConfirmed(identity)) setPending(null)
    }
  }
  function reload() {
    setCursor(null); setItems([]); setNext(null); setFailed(false); setLoading(true); setAttempt((value) => value + 1)
    window.dispatchEvent(new Event(notificationsChanged))
  }
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <PageHeader title={t('title')} />
    <Button disabled={loading || !!pending} onClick={reload}>{t('refresh')}</Button>
    {items.map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 2, border: 0, borderBottom: '1px solid', borderColor: 'divider', borderRadius: 0, bgcolor: item.readAt ? 'transparent' : 'background.paper', borderLeft: item.readAt ? 0 : '3px solid', borderLeftColor: 'primary.main' }}>
      <Stack spacing={1}>
        <Typography sx={{ fontWeight: item.readAt ? 'normal' : 'bold' }}>
          <Link href={`/users/${item.actor.username}`}>{item.actor.displayName}</Link>{' '}
          {t(item.kind === 'friend.requested' ? 'requested' : item.kind === 'friend.accepted' ? 'accepted' : 'commented')}
          {item.trackName ? ` «${item.trackName}»` : ''}
        </Typography>
        <Typography variant="caption"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(locale)}</time></Typography>
        <Link href={item.trackId && item.commentId ? discussionLink(item.trackId, item.commentId) : '/friends'}>{t(item.kind === 'track.commented' ? 'openDiscussion' : 'openFriends')}</Link>
        {!item.readAt && <Button disabled={!!pending} onClick={() => void read(item)}>{t('markRead')}</Button>}
      </Stack>
    </Paper>)}
    {loading && <Typography role="status">{t('loading')}</Typography>}
    {failed && <Alert severity="error">{t('loadFailed')} <Button onClick={reload}>{t('retry')}</Button></Alert>}
    {writeFailed && <Alert severity="error">{t('writeFailed')} <Button onClick={reload}>{t('refresh')}</Button></Alert>}
    {!loading && !failed && items.length === 0 && <Typography>{t('empty')}</Typography>}
    {next && !failed && <Button disabled={loading || !!pending} onClick={() => { setLoading(true); setCursor(next) }}>{t('more')}</Button>}
  </Stack>
}
export function NotificationsInbox() {
  const { user, confirmed } = useViewer()
  const t = useTranslations('notifications')
  if (!confirmed) return <Typography role="status" sx={{ minWidth: 0 }}>{t('checkingSession')}</Typography>
  if (!user) return <Button component={Link} href="/login?returnTo=/notifications">{t('login')}</Button>
  return <Inbox key={user.id} identity={user.id} />
}
