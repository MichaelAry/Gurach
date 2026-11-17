import { LocalizedText } from '@/i18n/LocalizedText'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Typography } from '@mui/material'
import { getViewerSession } from '@/lib/server/session'
import { UserProfile } from '@/features/users/UserProfile'
type Props = { params: Promise<{ username: string }> }
async function PrivateUserPage({ params }: Props) {
  const { username } = await params
  if (!await getViewerSession()) redirect(`/login?returnTo=${encodeURIComponent(`/users/${username}`)}`)
  return <UserProfile username={username} />
}
export default function Page(props: Props) {
  return <><LocaleMetadata /><Suspense fallback={<Typography role="status" sx={{ p: 3 }}><LocalizedText messageKey="checkingSession" /></Typography>}><PrivateUserPage {...props} /></Suspense></>
}
