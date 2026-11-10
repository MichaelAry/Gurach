import { FavoritesProvider } from '@/features/favorites/FavoritesProvider'
import { ListenCountsProvider } from '@/features/tracks/components/ListenCountsProvider'
import { PlayerBar } from '@/components/player/PlayerBar'
import { PlayerProvider } from '@/components/player/PlayerProvider'
import Navbar from '@/components/navbar'
import { BackButton } from '@/features/navigation/components/BackButton'
import { Box } from '@mui/material'
import { Suspense } from 'react'
import { ViewerProvider } from '@/features/auth/ViewerProvider'
import { SessionControls } from '@/features/auth/SessionControls'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // Плеер живёт на всех страницах (main): контекст + <audio> + нижний бар
    <ViewerProvider><FavoritesProvider><ListenCountsProvider>
      <PlayerProvider>
        <Box sx={{ position: 'absolute', top: 0, left: 0, zIndex: 10 }}>
          <SessionControls />
        </Box>
        <Box
          sx={{
            position: 'fixed',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
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

        {/* paddingBottom — чтобы контент не уходил под fixed-бар плеера.
          Центрирование по ОБЕИМ осям: flex-контейнер на всю высоту экрана
          + margin:auto на колонке. Ведёт себя как абсолютное центрирование:
          при свободной высоте блок встаёт ровно в середину экрана, а когда
          контента больше, чем высоты вьюпорта, auto-маргины сворачиваются
          в ноль — верх не теряется, скролл работает как обычно.
          Navbar справа — fixed, вне потока и на расчёт центра не влияет. */}
        <main
          style={{
            paddingTop: 64,
            paddingBottom: 144,
            minHeight: 'calc(100vh - 144px)',
            display: 'flex',
          }}
        >
          <Box sx={{ width: '100%', maxWidth: 1000, margin: 'auto', '&:has([data-home-page])': { maxWidth: 1200 } }}>
            {children}
          </Box>
        </main>

        <PlayerBar />
      </PlayerProvider>
    </ListenCountsProvider></FavoritesProvider></ViewerProvider>
  )
}
