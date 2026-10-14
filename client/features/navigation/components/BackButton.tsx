'use client'

import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { IconButton } from '@mui/material'
import { usePathname, useRouter } from 'next/navigation'

type Props = {
  fallback?: string
}

export function BackButton({ fallback = '/tracks' }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push(pathname === fallback ? '/' : fallback)
  }

  return (
    <IconButton
      onClick={handleBack}
      aria-label="Go back"
      sx={{
        color: '#000',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <ArrowBackIcon />
    </IconButton>
  )
}
