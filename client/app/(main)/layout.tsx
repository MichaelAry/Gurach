import { PlayerBar } from '@/components/player/PlayerBar'
import { PlayerProvider } from '@/components/player/PlayerProvider'
import Navbar from '@/components/navbar'
import { BackButton } from '@/features/navigation/components/BackButton'
import { Box } from '@mui/material'
import { Suspense } from 'react'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    // Плеер живёт на всех страницах (main): контекст + <audio> + нижний бар
    <PlayerProvider>
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
          paddingBottom: 96,
          minHeight: 'calc(100vh - 96px)',
          display: 'flex',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 1000, margin: 'auto' }}>
          {children}
        </Box>
      </main>

      <PlayerBar />
    </PlayerProvider>
  )
}
