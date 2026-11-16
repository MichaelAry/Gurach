import { connection } from 'next/server'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Box } from '@mui/material'

export const instant = false

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // The shell uses the request's locale; do not prerender it with context defaults.
  await connection()
  return (
    <Box
      sx={{
        minHeight: '100vh',
        px: 2, pt: 10, pb: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box sx={{ position: 'absolute', top: 16, right: 16 }}><LanguageSwitcher /></Box>
      {children}
    </Box>
  )
}
