'use client'

import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder'
import LibraryMusicOutlinedIcon from '@mui/icons-material/LibraryMusicOutlined'
import { Box, ListItemButton, Tooltip } from '@mui/material'
import Link from 'next/link'
import type { TrackItem } from './types'

type Props = {
  item: TrackItem
  active: boolean
}

export const NavbarItem = ({ item, active }: Props) => {
  if (!item.href || !item.label) return null

  const Icon = item.href === '/'
    ? HomeOutlinedIcon
    : item.href === '/friends'
      ? PeopleOutlinedIcon
    : item.href === '/favorites'
      ? FavoriteBorderIcon
      : LibraryMusicOutlinedIcon

  return (
    <Tooltip title={item.label} placement="left" arrow describeChild>
      <ListItemButton
        component={Link}
        href={item.href}
        selected={active}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        sx={{
          minWidth: 44,
          minHeight: 44,
          justifyContent: 'center',
          px: 1.25,
          py: 1.25,
          borderRadius: 2,
          color: active ? 'text.primary' : 'text.secondary',
          '&:hover': { color: 'text.primary' },
          '&.Mui-focusVisible': {
            outline: '2px solid',
            outlineColor: 'text.primary',
            outlineOffset: 2,
          },
        }}
      >
        <Icon sx={{ fontSize: 22, flexShrink: 0 }} />
        <Box
          component="span"
          aria-hidden="true"
          sx={{
            position: 'absolute',
            right: 3,
            width: 3,
            height: 3,
            borderRadius: '50%',
            bgcolor: active ? 'text.primary' : 'transparent',
          }}
        />
      </ListItemButton>
    </Tooltip>
  )
}
