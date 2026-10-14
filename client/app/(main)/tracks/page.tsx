// app/(main)/tracks/page.tsx
import { TrackRow } from '@/features/tracks/components/TrackRow'
import { UploadTracksButton } from '@/features/tracks/components/UploadTracksButton'
import type { ITrack } from '@/types/track'
import { Box, Card, Stack, Typography } from '@mui/material'
const tracks: ITrack[] = [
  {
    _id: '1',
    name: 'Midnight Drive',
    artist: 'Neon Waves',
    lyrics: '',
    listens: 1240,
    picture: '/covers/midnight.jpg',
    audio: '/audio/midnight.mp3',
    comments: [],
  },
  {
    _id: '2',
    name: 'Ocean Eyes',
    artist: 'Luna Ray',
    lyrics: '',
    listens: 890,
    picture: '/covers/ocean.jpg',
    audio: '/audio/ocean.mp3',
    comments: [],
  },
  {
    _id: '3',
    name: 'Ghost Town',
    artist: 'The Midnight',
    lyrics: '',
    listens: 3120,
    picture: '/covers/ghost.jpg',
    audio: '/audio/ghost.mp3',
    comments: [],
  },
  {
    _id: '4',
    name: 'Paper Planes',
    artist: 'M.I.A.',
    lyrics: '',
    listens: 5400,
    picture: '/covers/paper.jpg',
    audio: '/audio/paper.mp3',
    comments: [],
  },
  {
    _id: '5',
    name: 'Silent Rain',
    artist: 'Kaito',
    lyrics: '',
    listens: 210,
    picture: '/covers/rain.jpg',
    audio: '/audio/rain.mp3',
    comments: [],
  },
]

export default function TracksPage() {
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
          <Stack spacing={1}>
            {tracks.map((track) => (
              <TrackRow key={track._id} track={track} />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  )
}
