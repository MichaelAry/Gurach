// theme/AppThemeProvider.tsx
'use client'

import { ListenCountsProvider } from '@/features/tracks/components/ListenCountsProvider'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { theme } from './index'

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
 * Сюда же добавлен ListenCountsProvider — клиентский стор счётчиков
 * прослушиваний. Он должен быть выше TrackRow / PlayButton, но ниже
 * ThemeProvider (компоненты MUI внутри стора не рендерятся, но пусть
 * будет по правилам). PlayerProvider может жить и ниже — главное, чтобы
 * ListenCountsProvider был выше тех, кто вызывает useBumpListen().
 */
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ListenCountsProvider>{children}</ListenCountsProvider>
    </ThemeProvider>
  )
}
