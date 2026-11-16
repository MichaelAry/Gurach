import { getText } from '@/i18n/server'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Typography } from '@mui/material'
import { getViewerSession } from '@/lib/server/session'
import { FriendsPage } from '@/features/friends/FriendsPage'
async function PrivateFriendsPage() {
  if (!await getViewerSession()) redirect('/login?returnTo=/friends')
  return <FriendsPage />
}
export default async function Page() {
  const lt = await getText()

  return <Suspense fallback={<Typography role="status" sx={{ p: 3 }}>{lt('checkingSession')}</Typography>}><PrivateFriendsPage /></Suspense>
}
