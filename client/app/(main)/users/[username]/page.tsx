import { getText } from '@/i18n/server'
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
export default async function Page(props: Props) {
  const lt = await getText()

  return <Suspense fallback={<Typography role="status" sx={{ p: 3 }}>{lt('checkingSession')}</Typography>}><PrivateUserPage {...props} /></Suspense>
}
