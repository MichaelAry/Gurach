// app/layout.tsx
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import type { Metadata } from 'next'

import { AppThemeProvider } from '@/theme/AppThemeProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gurach',
  description: 'Music player',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        {/* Провайдер — клиентский компонент: тему НЕ передаём пропсом,
            иначе React не сможет её сериализовать (500 на всех страницах). */}
        <AppRouterCacheProvider>
          <AppThemeProvider>{children}</AppThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
