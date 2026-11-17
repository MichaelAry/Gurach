import { FullscreenPlayer } from '@/features/player/FullscreenPlayer'
import { getText } from '@/i18n/server'

export async function generateMetadata() {
  const lt = await getText()
  return { title: `${lt('musicPlayer')} — Gurach` }
}

export default function PlayerPage() {
  return <FullscreenPlayer />
}
