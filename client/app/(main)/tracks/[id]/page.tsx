import { LocalizedText } from '@/i18n/LocalizedText'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'
// app/(main)/tracks/[id]/page.tsx
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import {
  Box,
  Card,
  Stack,
  Typography,
} from '@mui/material'
import { PlayerArtwork } from '@/features/player/PlayerArtwork'
import { typeRoles } from '@/theme/tokens'
import { notFound } from 'next/navigation'

import { getTrack } from '@/features/tracks/api/getTrack'
import { CommentsSection } from '@/features/comments/components/CommentsSection'
import { ListenCount } from '@/features/tracks/components/ListenCount'
import { PlayTrackButton } from '@/features/tracks/components/PlayTrackButton'
import { DownloadTrackButton } from '@/features/tracks/components/DownloadTrackButton'
import { QueueTrackActions } from '@/features/queue/components/QueueTrackActions'

interface TrackPageProps {
  params: Promise<{ id: string }>
}

export default async function TrackPage({ params }: TrackPageProps) {
  const { id } = await params
  const track = await getTrack(id)
  if (!track) notFound()

  return (
    <Box sx={{
      width: '100%',
      minWidth: 0,

    }}>
      <LocaleMetadata
        title={`${track.name} — ${track.artist ?? ''}`.trim()}
        openGraphDescription={track.artist ? { key: 'artistDescription', values: { name: track.name, artist: track.artist } } : track.name}
        image={track.picture ?? undefined}
      />
      <Card
        sx={{
          p: 0, border: 0, bgcolor: 'transparent', overflow: 'visible',
          mx: 'auto',
          width: '100%',

          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: { xs: 4, md: 8 },
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '340px minmax(0, 1fr)' }, gap: { xs: 3, md: 8 }, alignItems: 'center', minWidth: 0 }}>
          <Box
            sx={{
              width: { xs: 'min(100%, 320px)', md: 340 },
              maxWidth: '100%',
              aspectRatio: '1',
              height: 'auto',
              flexShrink: 0,
              borderRadius: 'var(--wae-radius-artwork)', boxShadow: 'var(--wae-shadow-artwork)',
              overflow: 'hidden',
              bgcolor: 'background.default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
            }}
          >
            <PlayerArtwork picture={track.picture} name={track.name} />
          </Box>
          <Box><Stack spacing={0.5} sx={{ minWidth: 0 }}>
            <Typography variant="h2" component="h1"
              sx={{ ...typeRoles.hero, fontSize: { xs: 36, sm: 48, md: 64 } }}>
              {track.name}
            </Typography>
            <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {track.artist}
            </Typography>
            {track.album && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              <LocalizedText messageKey="metadataAlbum" /> · {track.album}
            </Typography>}
            {!!track.genres?.length && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              <LocalizedText messageKey="metadataGenres" /> · {track.genres.join(' · ')}
            </Typography>}
            {track.provenance?.genreEvidence?.some(({ source }) => source === 'lastfm') && (
              <Typography component="a" href="https://www.last.fm/" variant="caption" color="text.secondary" sx={{ alignSelf: 'flex-start' }}>
                {'Last.fm'}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              <ListenCount trackId={track._id} value={track.listens} />
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1,  pt: 2.5, flexShrink: 0 }}>
            <PlayTrackButton track={track} />
            <FavoriteButton trackId={track._id} name={track.name} />
            <QueueTrackActions track={track} />
            <DownloadTrackButton track={track} />
          </Stack>
        </Box></Box>

        <Box sx={{
          display: 'grid',
          gridTemplateRows: 'auto auto',
          gap: 2,
          minWidth: 0,
          minHeight: { md: 0 },
        }}>
          <Box component="section" aria-labelledby="lyrics-heading" sx={{
            py: 3, borderTop: '1px solid', borderColor: 'divider', maxWidth: '70ch',
            minHeight: 0, display: 'flex', flexDirection: 'column',
          }}>
            <Typography id="lyrics-heading" component="h2" sx={{ ...typeRoles.section, mb: 3 }}>
              <LocalizedText messageKey="lyrics" /></Typography>
            <Box tabIndex={0} role="region" aria-labelledby="lyrics-heading" sx={{ overflowY: 'visible', minHeight: 0 }}>
              <Typography color="text.primary" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {track.lyrics || <LocalizedText messageKey="lyricsUnavailable" />}
              </Typography>
            </Box>
          </Box>
          <Box role="region" aria-labelledby="comments-heading" sx={{ borderTop: '1px solid', borderColor: 'divider', py: 3, minWidth: 0, maxWidth: '70ch', overflowWrap: 'anywhere' }}>
            <CommentsSection key={track._id} trackId={track._id} />
          </Box>
        </Box>
      </Card>
    </Box>
  )
}
