import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getViewerSession } from '@/lib/server/session'
import { NotificationsInbox } from '@/features/notifications/NotificationsInbox'
async function PrivateNotificationsPage() {
  if (!await getViewerSession()) redirect('/login?returnTo=/notifications')
  return <NotificationsInbox />
}
export default function Page() {
  return <Suspense fallback={null}><PrivateNotificationsPage /></Suspense>
}
