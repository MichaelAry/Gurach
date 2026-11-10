'use client'

import { Paper } from '@mui/material'
import { usePathname } from 'next/navigation'
import { Suspense } from 'react'
import { NavbarItem } from './NavbarItem'
import { trackStructure } from './trackStructure'

function NavigationLinks() {
  const pathname = usePathname()

  return trackStructure
    .filter((item) => item.isAnchor)
    .map((item) => (
      <NavbarItem
        key={item.id}
        item={item}
        active={
          pathname === item.href ||
          (item.href !== '/' && !!item.href && pathname.startsWith(`${item.href}/`))
        }
      />
    ))
}

export const Navbar = () => (
  <Paper
    component="nav"
    aria-label="Main navigation"
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
)

export default Navbar
