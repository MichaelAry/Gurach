import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },

  // Кэширование данных (нужно для 'use cache' в features/tracks/api/*).
  // Включать нужно ОБА флага одновременно.
  // Ранее отключалось из-за ошибки MUI — но она была не здесь: реальная причина
  // была в передаче createTheme() из серверного layout в клиентский
  // ThemeProvider (исправлено в theme/AppThemeProvider.tsx).
  // См. https://github.com/mui/material-ui/issues/47109 (закрыт в @mui/material-nextjs@7.3.5)
  cacheComponents: true,
  partialPrefetching: true,

  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
