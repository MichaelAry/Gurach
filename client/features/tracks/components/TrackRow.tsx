// features/tracks/components/TrackRow.tsx
import type { ITrack } from '@/types/track'
import { Card, Stack, Typography } from '@mui/material'
import Link from 'next/link'

export function TrackRow({ track }: { track: ITrack }) {
  return (
    <Link href={`/tracks/${track._id}`} style={{ textDecoration: 'none' }}>
      <Card
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Stack direction="row" sx={{ flex: 1, justifyContent: 'space-between' }}>
          <Typography sx={{ color: 'text.primary' }}>{track.name}</Typography>
          <Typography sx={{ color: 'text.secondary' }}>{track.artist}</Typography>
        </Stack>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
          {track.listens} listens
        </Typography>
      </Card>
    </Link>
  )
}
