'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge, Button, IconButton } from '@mui/material'
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined'
import { useViewer } from '@/features/auth/ViewerProvider'
import { useTranslations } from '@/i18n/LocaleProvider'

export const notificationsChanged = 'gurach:notifications-changed'
export function NotificationIndicator({ compact = false }: { compact?: boolean }) {
  const { user, isConfirmed } = useViewer()
  const identity = user?.id ?? null
  const t = useTranslations('notifications')
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let controller: AbortController | null = null
    const refresh = () => {
      controller?.abort()
      controller = new AbortController()
      const signal = controller.signal
      void fetch('/api/notifications/unread-count', {
        cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      }).then(async (response) => {
        if (!response.ok) throw new Error()
        const data: { count: number } = await response.json()
        if (!Number.isSafeInteger(data.count) || data.count < 0) throw new Error()
        if (!signal.aborted && isConfirmed(identity)) setCount(data.count)
      }).catch(() => { if (!signal.aborted && isConfirmed(identity)) setCount(null) })
    }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener(notificationsChanged, refresh)
    return () => { controller?.abort(); window.clearInterval(timer); window.removeEventListener(notificationsChanged, refresh) }
  }, [identity, isConfirmed])
  if (compact) return <IconButton component={Link} href="/notifications" aria-label={`${t('title')}: ${count === null ? t('countUnavailable') : count}`}><Badge badgeContent={count ?? '?'} color="primary"><NotificationsOutlined /></Badge></IconButton>
  return <Button component={Link} href="/notifications" aria-label={`${t('title')}: ${count === null ? t('countUnavailable') : count}`}>
    <Badge badgeContent={count ?? '?'} color="primary" sx={{ '& .MuiBadge-badge': { right: -8 } }}>{t('title')}</Badge>
  </Button>
}
