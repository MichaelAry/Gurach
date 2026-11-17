import { connection } from 'next/server'
import { FavoritesProvider } from '@/features/favorites/FavoritesProvider'
import { ListenCountsProvider } from '@/features/tracks/components/ListenCountsProvider'
import { PlayerProvider } from '@/components/player/PlayerProvider'
import { Suspense } from 'react'
import { MainShell } from '@/components/MainShell'
import type { Viewport } from 'next'
import { ViewerProvider } from '@/features/auth/ViewerProvider'

export const viewport: Viewport = { viewportFit: 'cover' }

export const instant = false

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // The shell uses the request's locale; do not prerender it with context defaults.
  await connection()
  return (
    // Плеер живёт на всех страницах (main): контекст + <audio> + нижний бар
    <ViewerProvider><FavoritesProvider><ListenCountsProvider>
      <PlayerProvider>
        <Suspense fallback={null}>
          <MainShell>{children}</MainShell>
        </Suspense>
      </PlayerProvider>
    </ListenCountsProvider></FavoritesProvider></ViewerProvider>
  )
}
