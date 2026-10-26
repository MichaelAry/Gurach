'use client'

import { Button } from '@mui/material'
import Link from 'next/link'

export function UploadTracksButton() {
  return (
    <Button
      component={Link}
      href="/upload"
      variant="contained"
      sx={{
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        '&:hover': { bgcolor: 'primary.dark' },
      }}
    >
      Upload
    </Button>
  )
}
