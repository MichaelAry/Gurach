import { Suspense } from 'react'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'
import { SharedPlaylist } from '@/features/playlists/Playlists'
export const metadata = { referrer: 'no-referrer', robots: { index: false, follow: false } }
async function Content({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <SharedPlaylist token={token} />
}
export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return <><LocaleMetadata /><Suspense fallback={null}><Content params={params} /></Suspense></>
}
