import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Typography } from '@mui/material'
import { getViewerSession } from '@/lib/server/session'
import { FriendsPage } from '@/features/friends/FriendsPage'
async function PrivateFriendsPage() {
  if (!await getViewerSession()) redirect('/login?returnTo=/friends')
  return <FriendsPage />
}
export default function Page() {
  return <Suspense fallback={<Typography role="status" sx={{ p: 3 }}>Проверяем сессию…</Typography>}><PrivateFriendsPage /></Suspense>
}
