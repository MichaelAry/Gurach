'use client'
import { useText } from '@/i18n/LocaleProvider'

import { Button } from '@mui/material'
import Link from 'next/link'
import { useViewer } from '@/features/auth/ViewerProvider'

export function UploadTracksButton() {
  const lt = useText()

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
      {user ? lt('upload') : lt('signInToUpload')}
    </Button>
  )
}
