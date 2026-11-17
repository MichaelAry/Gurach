// app/layout.tsx
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { getLocale } from '@/i18n/server'
import { FormValidation } from '@/i18n/FormValidation'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import localFont from 'next/font/local'

import { AppThemeProvider } from '@/theme/AppThemeProvider'
import './globals.css'

// The locale cookie determines <html lang> before the document can render.
// Allow this root layout to wait for the request with Cache Components enabled.
export const instant = false

const onest = localFont({
  src: './fonts/Onest-Variable.woff2',
  variable: '--font-onest',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: true,
  adjustFontFallback: 'Arial',
})

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <html data-scroll-behavior="smooth" lang={locale} className={onest.variable}>
      <body suppressHydrationWarning>
        <AppRouterCacheProvider>
          <LocaleProvider initialLocale={locale}><AppThemeProvider><FormValidation />{children}</AppThemeProvider></LocaleProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
