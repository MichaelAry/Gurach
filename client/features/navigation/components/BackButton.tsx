'use client'

import { useTranslations } from '@/i18n/LocaleProvider'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { IconButton } from '@mui/material'
import { usePathname, useRouter } from 'next/navigation'

type Props = {
  fallback?: string
}

export function BackButton({ fallback = '/tracks' }: Props) {
  const t = useTranslations('navigation')
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
      aria-label="Назад"
      sx={{
        color: 'text.primary',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <ArrowBackIcon />
    </IconButton>
  )
}
