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

export async function generateMetadata() {
  return {
    title: 'Треки',
    description: 'Список всех треков',
  }
}

export default function TracksPage() {
  return (
    <Box sx={{ p: 3 }}>
      {/* Ширину задаёт центральная колонка layout — страница на всю её ширину */}
      <Card sx={{ width: '100%', p: 2 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h1" sx={{ fontSize: '1.5rem' }}>
            Список треков
          </Typography>
          <UploadTracksButton />
        </Stack>
      </Card>

      <Box sx={{ width: '100%', mt: 2 }}>
        <Suspense fallback={<Typography color="text.secondary">Загружаем треки…</Typography>}>
          <CatalogueData />
        </Suspense>
      </Box>
    </Box>
  )
}
