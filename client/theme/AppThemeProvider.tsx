// theme/AppThemeProvider.tsx
'use client'

import { CssBaseline, ThemeProvider } from '@mui/material'
import { theme } from './index'
import { createTheme } from '@mui/material/styles'
import { enUS, ruRU } from '@mui/material/locale'
import { useLocale } from '@/i18n/LocaleProvider'
const themes = { en: createTheme(theme, enUS), ru: createTheme(theme, ruRU) }

/**
 * Клиентский провайдер MUI-темы.
 *
 * Важно: `theme` (объект с функциями из createTheme) импортируется ЗДЕСЬ,
 * внутри client-модуля, а не передаётся пропсом из серверного layout.
 * Иначе React падает с ошибкой
 * "Functions cannot be passed directly to Client Components"
 * и все страницы отдают 500.
 *
 * Серверный layout рендерит <AppThemeProvider>{children}</AppThemeProvider>
 * (см. app/layout.tsx) — children остаются серверными компонентами.
 *
 */
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale()
  return (
    <ThemeProvider theme={themes[locale]}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
