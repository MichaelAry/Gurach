import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter'
import './globals.css'

export const metadata = {
  title: 'Gurach',
  description: 'Music app',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppRouterCacheProvider>{children}</AppRouterCacheProvider>
      </body>
    </html>
  )
}
