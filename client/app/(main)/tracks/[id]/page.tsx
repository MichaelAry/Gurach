// app/(main)/tracks/[id]/page.tsx
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import {
  Box,
  Card,
  Stack,
  Typography,
} from '@mui/material'
import { notFound } from 'next/navigation'

import { getTrack } from '@/features/tracks/api/getTrack'
import { CommentsSection } from '@/features/comments/components/CommentsSection'
import { ListenCount } from '@/features/tracks/components/ListenCount'
import { PlayTrackButton } from '@/features/tracks/components/PlayTrackButton'
import { QueueTrackActions } from '@/features/queue/components/QueueTrackActions'

interface TrackPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: TrackPageProps) {
  const { id } = await params
  try {
    const track = await getTrack(id)
    if (!track) return { title: 'Track not found' }

    return {
      title: `${track.name} — ${track.artist ?? ''}`.trim(),
      openGraph: {
        ...(track.picture ? { images: [track.picture] } : {}),
        description: `${track.name} by ${track.artist ?? ''}`.trim(),
      },
    }
  } catch {
    // Метадата не должна ронять рендер страницы
    return { title: 'Track' }
  }
}

export default async function TrackPage({ params }: TrackPageProps) {
  const { id } = await params
  const track = await getTrack(id)
  if (!track) notFound()

  return (
    <Box sx={{
      width: { xs: '100%', md: 'min(150%, calc(100vw - 32px))' },
      position: 'relative',
      left: { md: '50%' },
      transform: { md: 'translateX(-50%)' },
      px: { xs: 2, sm: 3 },
      pr: { xs: 8, sm: 10 },
    }}>
      <Box sx={{ zoom: 1.3 }}>
        <Card
          sx={{
            p: { xs: 2.5, sm: 3.5 },
            mx: 'auto',
            width: '100%',
            height: 'calc((100dvh - 224px) / 1.3)',
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
            gap: 2.5,
            overflowY: 'auto',
          }}
        >
          <Stack spacing={2.5} sx={{ minWidth: 0, minHeight: { md: 0 }, overflowY: { md: 'auto' } }}>
            <Box
              sx={{
                width: { xs: 176, sm: 288 },
                maxWidth: '100%',
                aspectRatio: '1',
                height: 'auto',
                flexShrink: 0,
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: 'background.default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
              }}
            >
              {track.picture ? (
                <Box component="img" src={track.picture} alt={track.name}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : '♪'}
            </Box>
            <Stack spacing={0.5} sx={{ minWidth: 0 }}>
              <Typography variant="h2" component="h1"
                sx={{ fontSize: { xs: '1.375rem', sm: '2rem' }, overflowWrap: 'anywhere' }}>
                {track.name}
              </Typography>
              <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                {track.artist}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <ListenCount trackId={track._id} value={track.listens} />
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, mt: 'auto !important', pt: 2.5, flexShrink: 0 }}>
              <PlayTrackButton track={track} />
              <FavoriteButton trackId={track._id} name={track.name} />
              <QueueTrackActions track={track} />
            </Stack>
          </Stack>

          <Box sx={{
            display: 'grid',
            gridTemplateRows: { xs: 'minmax(160px, auto) minmax(160px, auto)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
            gap: 2,
            minWidth: 0,
            minHeight: { md: 0 },
          }}>
            <Box component="section" aria-labelledby="lyrics-heading" sx={{
              p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2,
              minHeight: 0, display: 'flex', flexDirection: 'column',
            }}>
              <Typography id="lyrics-heading" component="h2" sx={{
                fontWeight: 700, mb: 1.5, px: 1.5, py: 1,
                bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider', borderRadius: 1,
              }}>
                Лирика
              </Typography>
              <Box tabIndex={0} role="region" aria-labelledby="lyrics-heading" sx={{ overflowY: 'auto', minHeight: 0 }}>
                <Typography color="text.primary" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {track.lyrics || 'Лирика недоступна'}
                </Typography>
              </Box>
            </Box>
            <Box tabIndex={0} role="region" aria-labelledby="comments-heading" sx={{
              px: 2, pb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2,
              overflowY: 'auto', minHeight: 0,
              '& #comments-heading': {
                fontSize: '1rem', fontWeight: 700, mb: 1.5, px: 1.5, py: 1,
                bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider', borderRadius: 1,
              },
            }}>
              <CommentsSection key={track._id} trackId={track._id} />
            </Box>
          </Box>
        </Card>
      </Box>
    </Box>
  )
}
