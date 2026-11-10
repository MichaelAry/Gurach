'use client'

import { Button } from '@mui/material'
import Link from 'next/link'
import { useViewer } from '@/features/auth/ViewerProvider'

export function UploadTracksButton() {
  const { user, loading } = useViewer()
  if (loading) return null
  return (
    <Button
      component={Link}
      href={user ? '/upload' : '/login?returnTo=/upload'}
      variant="contained"
      sx={{
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        '&:hover': { bgcolor: 'primary.dark' },
      }}
    >
      {user ? 'Загрузить' : 'Войти для загрузки'}
    </Button>
  )
}
