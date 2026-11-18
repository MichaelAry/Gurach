'use client'
import { Box } from '@mui/material'
import GraphicEqRounded from '@mui/icons-material/GraphicEqRounded'
import PauseCircleOutlineRounded from '@mui/icons-material/PauseCircleOutlineRounded'
import { useText } from '@/i18n/LocaleProvider'

export function CurrentTrackLabel({ playing }: { playing: boolean }) {
  const lt = useText()
  return <Box component="span" data-current-track-label sx={{ display: 'flex', alignItems: 'center', gap: .5, minWidth: 0, maxWidth: '100%', fontSize: 12, fontWeight: 600, color: 'var(--wae-accentText)', '& svg': { flexShrink: 0 } }}>
    {playing ? <GraphicEqRounded sx={{ fontSize: 16 }} /> : <PauseCircleOutlineRounded sx={{ fontSize: 16 }} />}
    {lt(playing ? 'nowPlaying' : 'currentTrackPaused')}
  </Box>
}
