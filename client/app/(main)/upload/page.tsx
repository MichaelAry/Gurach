'use client'
import { useText } from '@/i18n/LocaleProvider'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'
import { useViewer } from '@/features/auth/ViewerProvider'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { Box, Button, Typography } from '@mui/material'
import { UploadTrackForm } from '@/features/tracks/components/UploadTrackForm'

function UploadContent() {
  const lt = useText()

  const { user, loading } = useViewer()
  if (loading) return <Typography>{lt('checkingSession')}</Typography>
  if (!user) return <Box sx={{ p: 3 }}><Typography>{lt('signInToUploadTracks')}</Typography><Button component={Link} href="/login?returnTo=/upload">{lt('signIn')}</Button></Box>
  return (
    <Box sx={{ maxWidth: 680, width: '100%', mx: 'auto' }}>
      <PageHeader title={lt('uploadTracks')} />

      <UploadTrackForm />
    </Box>
  )
}

export default function UploadPage() {
  return <><LocaleMetadata /><UploadContent /></>
}
