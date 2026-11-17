'use client'
import { useText } from '@/i18n/LocaleProvider'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'
import { useViewer } from '@/features/auth/ViewerProvider'
import Link from 'next/link'
import { Box, Button, Typography } from '@mui/material'
import { UploadTrackForm } from '@/features/tracks/components/UploadTrackForm'

function UploadContent() {
  const lt = useText()

  const { user, loading } = useViewer()
  if (loading) return <Typography>{lt('checkingSession')}</Typography>
  if (!user) return <Box sx={{ p: 3 }}><Typography>{lt('signInToUploadTracks')}</Typography><Button component={Link} href="/login?returnTo=/upload">{lt('signIn')}</Button></Box>
  return (
    <Box sx={{ p: 3, maxWidth: 600, width: '100%', mx: 'auto' }}>
      <Typography variant="h1" sx={{ fontSize: '1.5rem', mb: 2 }}>
        {lt('uploadTracks')}</Typography>

      <UploadTrackForm />
    </Box>
  )
}

export default function UploadPage() {
  return <><LocaleMetadata /><UploadContent /></>
}
