// app/layout.tsx
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import type { Metadata } from 'next'

import { AppThemeProvider } from '@/theme/AppThemeProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gurach',
  description: 'Музыкальный плеер',
  openGraph: {
    title: 'Gurach',
    description: 'Музыкальный плеер',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body suppressHydrationWarning>
        <AppRouterCacheProvider>
          <AppThemeProvider>{children}</AppThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
