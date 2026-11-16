// app/layout.tsx
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { LocaleProvider, type Locale } from '@/i18n/LocaleProvider'
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
  description: 'Music player',
  openGraph: {
    title: 'Gurach',
    description: 'Музыкальный плеер',
    type: 'website',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const savedLocale = (await cookies()).get('NEXT_LOCALE')?.value
  const locale: Locale = savedLocale === 'ru' ? 'ru' : 'en'
  return (
    <html lang={locale} className={onest.variable}>
      <body suppressHydrationWarning>
        <AppRouterCacheProvider>
          <AppThemeProvider><LocaleProvider initialLocale={locale}>{children}</LocaleProvider></AppThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
