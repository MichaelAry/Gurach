'use client'

import { Box } from '@mui/material'
import { NavbarItem } from './NavbarItem'
import { useHoveredIndex } from './hooks/useHoveredIndex'
import { trackStructure } from './trackStructure'

export const Navbar = () => {
  const { hoveredIdx, onEnter, onLeave } = useHoveredIndex()

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        alignItems: 'flex-end',
        perspective: '800px',
        transformStyle: 'preserve-3d',
        userSelect: 'none',
      }}
    >
      {trackStructure.map((item, idx) => (
        <NavbarItem
          key={item.id}
          item={item}
          idx={idx}
          hoveredIdx={hoveredIdx}
          onEnter={onEnter}
          onLeave={onLeave}
        />
      ))}
    </Box>
  )
}

export default Navbar
