'use client'

import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined'
import { IconButton } from '@mui/material'
import { useText } from '@/i18n/LocaleProvider'
import type { TrackListItem } from '../types'

export function DownloadTrackButton({ track }: { track: Pick<TrackListItem, '_id' | 'audio'> }) {
  const lt = useText()
  if (!track.audio) return null

  const href = `/api/tracks/${encodeURIComponent(track._id)}/download`
  const label = lt('downloadTrack')

  return (
    <IconButton component="a" href={href} download aria-label={label} title={label} size="small">
      <FileDownloadOutlined fontSize="small" />
    </IconButton>
  )
}
