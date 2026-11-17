'use client'
import { Box, ListItemButton } from '@mui/material'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useText, useTranslations } from '@/i18n/LocaleProvider'
export function Navbar({ onNavigate }: { onNavigate?: () => void }) {
 const pathname = usePathname(), t = useTranslations('navigation'), lt = useText()
 const links = [['/', t('main')], ['/tracks', t('tracks')], ['/favorites', t('favorites')], ['/playlists', lt('playlists')], ['/friends', t('friends')]]
 return <Box component="nav" aria-label={t('main')} sx={{ display: 'flex', gap: .5, flexDirection: { xs: 'column', md: 'row' }, py: .5 }}>
 {links.map(([href, label]) => { const active = pathname === href || (href !== '/' && pathname.startsWith(href + '/')) || (href === '/friends' && pathname.startsWith('/users/')); return <ListItemButton key={href} component={Link} href={href} selected={active} aria-current={active ? 'page' : undefined} onClick={onNavigate} sx={{ minHeight: 44, flexGrow: 0, borderRadius: 1, px: 2, fontWeight: active ? 600 : 500 }}>{label}</ListItemButton> })}
 </Box>
}
export default Navbar
