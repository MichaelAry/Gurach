import { LocalizedText } from '@/i18n/LocalizedText'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'
// app/(main)/tracks/page.tsx
import { UploadTracksButton } from '@/features/tracks/components/UploadTracksButton'
import { getTracksPage } from '@/features/tracks/api/getTracksPage'
import { TracksCatalogue } from '@/features/tracks/components/TracksCatalogue'
import { PageHeader } from '@/components/ui/PageHeader'
import { Box, Typography } from '@mui/material'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function CatalogueData() {
  await connection()
  const page = await getTracksPage()
  return <TracksCatalogue initialPage={page} />
}

export default function TracksPage() {
  return (
    <Box>
      <LocaleMetadata title={{ key: 'tracks' }} description={{ key: 'browseAndSearchTracksByTitleOrArtist' }} />
      <PageHeader title={<LocalizedText messageKey="trackList" />} actions={<UploadTracksButton />} />

      <Box sx={{ width: '100%', mt: 2 }}>
        <Suspense fallback={<Typography color="text.secondary"><LocalizedText messageKey="loadingTracks" /></Typography>}>
          <CatalogueData />
        </Suspense>
      </Box>
    </Box>
  )
}
