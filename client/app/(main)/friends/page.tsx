import { LocalizedText } from '@/i18n/LocalizedText'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'
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
  return <><LocaleMetadata /><Suspense fallback={<Typography role="status" sx={{ p: 3 }}><LocalizedText messageKey="checkingSession" /></Typography>}><PrivateFriendsPage /></Suspense></>
}
