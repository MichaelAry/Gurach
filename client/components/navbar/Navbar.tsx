'use client'

import { Paper } from '@mui/material'
import { usePathname } from 'next/navigation'
import { Suspense } from 'react'
import { NavbarItem } from './NavbarItem'
import { trackStructure } from './trackStructure'
import { useTranslations } from '@/i18n/LocaleProvider'

function NavigationLinks() {
  const pathname = usePathname()
  const t = useTranslations('navigation')

  return trackStructure
    .filter((item) => item.isAnchor)
    .map((item) => (
      <NavbarItem
        key={item.id}
        item={{ ...item, label: item.href === '/' ? t('main') : item.href === '/tracks' ? t('tracks') : item.href === '/favorites' ? t('favorites') : item.href === '/friends' ? t('friends') : item.label }}
        active={
          pathname === item.href ||
          (item.href !== '/' && !!item.href && pathname.startsWith(`${item.href}/`))
        }
      />
    ))
}

export const Navbar = () => {
  const t = useTranslations('navigation')
  return <Paper
    component="nav"
    aria-label={t('main')}
    variant="outlined"
    sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0.5,
      p: 0.5,
      borderRadius: 3,
    }}
  >
    <Suspense fallback={null}>
      <NavigationLinks />
    </Suspense>
  </Paper>
}

export default Navbar
