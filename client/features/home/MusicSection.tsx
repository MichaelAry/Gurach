'use client'
import { useText } from '@/i18n/LocaleProvider'
import Link from 'next/link'
import { PlayerArtwork } from '@/features/player/PlayerArtwork'
import { typeRoles } from '@/theme/tokens'
import { Box, Button, Stack, Typography } from '@mui/material'
import type { TrackListItem } from '@/features/tracks/types'
import { PlayButton } from '@/features/tracks/components/PlayButton'
export function MusicRows({ tracks }: { tracks: TrackListItem[] }) {
  const lt = useText()

  return (
    <Stack spacing={0.5}>
      {tracks.map((track) => (
        <Stack
          key={track._id}
          direction="row"
          spacing={1.5}
          sx={{
            alignItems: 'center',
            py: 1,
            minWidth: 0,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: 'var(--wae-radius-artwork)', overflow: 'hidden' }}><PlayerArtwork picture={track.picture} name="" /></Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              component={Link}
              href={`/tracks/${track._id}`}
              noWrap
              sx={{
                display: 'block',
                color: 'text.primary',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              {track.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {track.artist || lt('unknownArtist')}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {track.duration
              ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}`
              : '—'}
          </Typography>
          <PlayButton track={track} />
        </Stack>
      ))}
    </Stack>
  )
}
export function Section({
  title,
  children,
  href,
}: {
  title: string
  children: React.ReactNode
  href?: string
}) {
  const lt = useText()

  return (
    <Box
      component="section"
      sx={{
        pt: { xs: 3, md: 5 },
        borderTop: '1px solid',
        borderColor: 'divider',
        minWidth: 0,
      }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 3 }}
      >
        <Typography component="h2" sx={typeRoles.section}>
          {title}
        </Typography>
        {href && (
          <Button component={Link} href={href} size="small">
            {lt('viewAll')}</Button>
        )}
      </Stack>
      {children}
    </Box>
  )
}
