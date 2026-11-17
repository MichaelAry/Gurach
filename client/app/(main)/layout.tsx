import { connection } from 'next/server'
import { FavoritesProvider } from '@/features/favorites/FavoritesProvider'
import { ListenCountsProvider } from '@/features/tracks/components/ListenCountsProvider'
import { PlayerBar } from '@/components/player/PlayerBar'
import { PlayerProvider } from '@/components/player/PlayerProvider'
import Navbar from '@/components/navbar'
import { BackButton } from '@/features/navigation/components/BackButton'
import { Box } from '@mui/material'
import { Suspense } from 'react'
import type { Viewport } from 'next'
import { ViewerProvider } from '@/features/auth/ViewerProvider'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { SessionControls } from '@/features/auth/SessionControls'

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
        <Box sx={{ position: { xs: 'static', md: 'absolute' }, top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', alignItems: 'flex-start', gap: 1, overflowWrap: 'anywhere' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <SessionControls />
          </Box>
          <Box sx={{ mt: 2, mr: 2, maxWidth: '50%' }}>
            <LanguageSwitcher />
          </Box>
        </Box>
        <Box
          sx={{
            position: { xs: 'static', md: 'fixed' },
            zIndex: 1200,
            right: 0,
            top: '50%',
            transform: { md: 'translateY(-50%)' },
            display: 'flex',
            flexDirection: { xs: 'row', md: 'column' },
            flexWrap: 'wrap',
            '& nav': { flexDirection: { xs: 'row', md: 'column' }, flexWrap: 'wrap' },
            alignItems: 'flex-end',
            gap: 1,
            p: 1,
            perspective: '800px',
            transformStyle: 'preserve-3d',
            userSelect: 'none',
          }}
        >
          <Suspense fallback={null}>
            <BackButton />
          </Suspense>

          <Navbar />
        </Box>

        {/* PlayerBar measures its full height, including errors and the safe area. */}
        <Box
          component="main"
          sx={{
            pt: { xs: 2, md: 8 },
            pr: { md: '72px' },
            pb: 'calc(var(--player-bar-height, 180px) + 24px)',
            minHeight: '100dvh',
            minWidth: 0,
            display: 'flex',
            '& [tabindex]:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            '& :is([id], input, textarea, button, a, [tabindex])': {
              scrollMarginTop: '16px',
              scrollMarginBottom: 'calc(var(--player-bar-height, 180px) + 24px)',
            },
          }}
        >
          <Box sx={{ width: '100%', maxWidth: 1000, margin: 'auto', '&:has([data-home-page])': { maxWidth: 1200 } }}>
            {children}
          </Box>
        </Box>

        <PlayerBar />
      </PlayerProvider>
    </ListenCountsProvider></FavoritesProvider></ViewerProvider>
  )
}
