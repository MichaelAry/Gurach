import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter'

import './globals.css'

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        <AppRouterCacheProvider>{children}</AppRouterCacheProvider>
      </body>
    </html>
  )
}
