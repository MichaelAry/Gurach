'use client'

import type { ITrack } from '@/types/track'
import { Stack } from '@mui/material'
import { TrackRow } from './TrackRow'

export function TrackList({ tracks }: { tracks: ITrack[] }) {
  return (
    <Stack direction="column" spacing={2}>
      {tracks.map((track) => (
        // весь список становится очередью для prev/next в плеере
        <TrackRow key={track._id} track={track} queue={tracks} />
      ))}
    </Stack>
  )
}
