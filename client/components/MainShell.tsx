'use client'
import { Suspense, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Box, Drawer, IconButton, Stack, Typography } from '@mui/material'
import MenuRounded from '@mui/icons-material/MenuRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import { Navbar } from './navbar/Navbar'
import { BackButton } from '@/features/navigation/components/BackButton'
import { LanguageSwitcher } from './LanguageSwitcher'
import { SessionControls } from '@/features/auth/SessionControls'
import { NotificationIndicator } from '@/features/notifications/NotificationIndicator'
import { useViewer } from '@/features/auth/ViewerProvider'
import { useText } from '@/i18n/LocaleProvider'
import { PlayerBar } from './player/PlayerBar'
import { density } from '@/theme/tokens'
const container = { width: '100%', maxWidth: 1224, mx: 'auto', px: { xs: 2, sm: 3, md: 4 } }
export function MainShell({ children }: { children: ReactNode }) {
 const pathname = usePathname(), lt = useText(), viewer = useViewer()
 const [menu, setMenu] = useState(false)
 if (pathname === '/player') return <Box component="main" sx={{ minHeight: '100dvh', minWidth: 0 }}>{children}</Box>
 return <>
 <a className="skip-link" href="#main-content">{lt('skipToContent')}</a>
 <Box component="header" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
  <Box sx={{ ...container, display: 'flex', alignItems: 'center', gap: 2, minHeight: 64 }}>
   <Typography component={Link} href="/" sx={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.04em', color: 'text.primary', textDecoration: 'none', mr: 'auto' }}>{'Gurach'}</Typography>
   <Stack direction="row" sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 2 }}><LanguageSwitcher /><SessionControls /></Stack>
   <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center' }}>{viewer.confirmed && viewer.user && <NotificationIndicator compact />}<IconButton aria-label={lt('openMenu')} aria-expanded={menu} aria-controls={menu ? 'mobile-menu' : undefined} onClick={() => setMenu(true)}><MenuRounded /></IconButton></Box>
  </Box>
  <Box sx={{ ...container, display: { xs: 'none', md: 'block' } }}><Suspense fallback={null}><Navbar /></Suspense></Box>
 </Box>
 <Drawer open={menu} onClose={() => setMenu(false)} slotProps={{ paper: { sx: { width: 'min(320px, calc(100vw - 32px))', p: 2, pb: 'max(24px, env(safe-area-inset-bottom))' } } }}>
  <Stack id="mobile-menu" spacing={2}>
   <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}><Typography variant="h6">{'Gurach'}</Typography><IconButton aria-label={lt('closeMenu')} onClick={() => setMenu(false)}><CloseRounded /></IconButton></Stack>
   <Suspense fallback={null}><Navbar onNavigate={() => setMenu(false)} /></Suspense>
   <Box onClick={event => { if ((event.target as HTMLElement).closest('a')) setMenu(false) }}><SessionControls /></Box>
   <LanguageSwitcher />
  </Stack>
 </Drawer>
 <Box component="main" id="main-content" tabIndex={-1} sx={{ ...container, pt: pathname === '/' ? { xs: 3, md: 5 } : density.pageTop, pb: 'calc(var(--player-bar-height, 200px) + 24px)', minHeight: '70dvh', minWidth: 0, '& :is([id], input, textarea, button, a, [tabindex])': { scrollMarginTop: 16, scrollMarginBottom: 'calc(var(--player-bar-height, 200px) + 24px)' } }}>
  {pathname !== '/' && <Box sx={{ mb: density.headerGap }}><Suspense fallback={null}><BackButton /></Suspense></Box>}
  {children}
 </Box>
 <PlayerBar />
 </>
}
