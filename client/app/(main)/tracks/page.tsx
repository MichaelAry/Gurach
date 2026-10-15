// app/(main)/tracks/page.tsx
import { TrackList } from '@/features/tracks/components/TrackList'
import { UploadTracksButton } from '@/features/tracks/components/UploadTracksButton'
import { getTracks } from '@/features/tracks/api/getTracks'
import { Box, Card, Stack, Typography } from '@mui/material'

export async function generateMetadata() {
  return {
    title: 'Tracks',
    description: 'List of all tracks',
  }
}

export default async function TracksPage() {
  const tracks = await getTracks()

  return (
    <Box sx={{ p: 3 }}>
      <Card sx={{ width: 900, p: 2 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h1" sx={{ fontSize: '1.5rem' }}>
            Tracks list
          </Typography>
          <UploadTracksButton />
        </Stack>
      </Card>

      <Box sx={{ width: 900, mt: 2 }}>
        {tracks.length === 0 ? (
          <Typography sx={{ color: 'text.secondary' }}>No tracks yet.</Typography>
        ) : (
          <TrackList tracks={tracks} />
        )}
      </Box>
    </Box>
  )
}