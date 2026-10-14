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
        bgcolor: '#000',
        color: '#fff',
        '&:hover': { bgcolor: '#222' },
      }}
    >
      Upload
    </Button>
  )
}
