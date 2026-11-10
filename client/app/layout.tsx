// app/layout.tsx
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import type { Metadata } from 'next'
import localFont from 'next/font/local'

import { AppThemeProvider } from '@/theme/AppThemeProvider'
import './globals.css'

const onest = localFont({
  src: './fonts/Onest-Variable.woff2',
  variable: '--font-onest',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: true,
  adjustFontFallback: 'Arial',
})

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
    <html lang="ru" className={onest.variable}>
      <body suppressHydrationWarning>
        <AppRouterCacheProvider>
          <AppThemeProvider>{children}</AppThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
