'use client'
import Link from 'next/link'
import { Avatar, Box, Button, Stack, Typography } from '@mui/material'
import type { TrackListItem } from '@/features/tracks/types'
import { PlayButton } from '@/features/tracks/components/PlayButton'
export function MusicRows({ tracks }: { tracks: TrackListItem[] }) {
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
          <Avatar
            variant="rounded"
            src={track.picture || undefined}
            alt=""
            sx={{ width: 44, height: 44, bgcolor: 'action.hover' }}
          >
            ♪
          </Avatar>
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
              {track.artist || 'Неизвестный исполнитель'}
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
  return (
    <Box
      component="section"
      sx={{
        p: { xs: 2, md: 2.5 },
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        minWidth: 0,
      }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}
      >
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        {href && (
          <Button component={Link} href={href} size="small">
            Все →
          </Button>
        )}
      </Stack>
      {children}
    </Box>
  )
}
