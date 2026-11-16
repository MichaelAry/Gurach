'use client'
import { useText } from '@/i18n/LocaleProvider'

import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { IconButton } from '@mui/material'
import { usePathname, useRouter } from 'next/navigation'

type Props = {
  fallback?: string
}

export function BackButton({ fallback = '/tracks' }: Props) {
  const lt = useText()

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
      aria-label={lt('goBack')}
      sx={{
        color: 'text.primary',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <ArrowBackIcon />
    </IconButton>
  )
}
