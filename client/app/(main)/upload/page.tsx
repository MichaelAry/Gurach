'use client'
import { useViewer } from '@/features/auth/ViewerProvider'
import Link from 'next/link'
import { Box, Button, Typography } from '@mui/material'
import { UploadTrackForm } from '@/features/tracks/components/UploadTrackForm'

export default function UploadPage() {
  const { user, loading } = useViewer()
  if (loading) return <Typography>Проверяем сессию…</Typography>
  if (!user) return <Box sx={{ p: 3 }}><Typography>Для загрузки требуется вход.</Typography><Button component={Link} href="/login?returnTo=/upload">Войти</Button></Box>
  return (
    <Box sx={{ p: 3, maxWidth: 600, width: '100%', mx: 'auto' }}>
      <Typography variant="h1" sx={{ fontSize: '1.5rem', mb: 2 }}>
        Загрузка треков
      </Typography>

      <UploadTrackForm />
    </Box>
  )
}
