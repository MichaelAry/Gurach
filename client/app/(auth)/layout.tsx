import { connection } from 'next/server'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import Link from 'next/link'
import { Box } from '@mui/material'

export const instant = false

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // The shell uses the request's locale; do not prerender it with context defaults.
  await connection()
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        px: 2, pt: 10, pb: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box sx={{ position: 'absolute', top: 20, left: 24, fontSize: 24, fontWeight: 600, letterSpacing: '-.04em', color: 'text.primary', textDecoration: 'none' }}><Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>{'Gurach'}</Link></Box>
      <Box sx={{ position: 'absolute', top: 16, right: 16 }}><LanguageSwitcher /></Box>
      {children}
    </Box>
  )
}
