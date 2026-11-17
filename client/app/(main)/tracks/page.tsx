import { LocalizedText } from '@/i18n/LocalizedText'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'
// app/(main)/tracks/page.tsx
import { UploadTracksButton } from '@/features/tracks/components/UploadTracksButton'
import { getTracksPage } from '@/features/tracks/api/getTracksPage'
import { TracksCatalogue } from '@/features/tracks/components/TracksCatalogue'
import { Box, Card, Stack, Typography } from '@mui/material'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function CatalogueData() {
  await connection()
  const page = await getTracksPage()
  return <TracksCatalogue initialPage={page} />
}

export default function TracksPage() {
  return (
    <Box sx={{ p: 3 }}>
      <LocaleMetadata title={{ key: 'tracks' }} description={{ key: 'browseAndSearchTracksByTitleOrArtist' }} />
      {/* Ширину задаёт центральная колонка layout — страница на всю её ширину */}
      <Card sx={{ width: '100%', p: 2 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h1" sx={{ fontSize: '1.5rem' }}>
            <LocalizedText messageKey="trackList" /></Typography>
          <UploadTracksButton />
        </Stack>
      </Card>

      <Box sx={{ width: '100%', mt: 2 }}>
        <Suspense fallback={<Typography color="text.secondary"><LocalizedText messageKey="loadingTracks" /></Typography>}>
          <CatalogueData />
        </Suspense>
      </Box>
    </Box>
  )
}
