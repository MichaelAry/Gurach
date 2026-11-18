'use client'
import { useText } from '@/i18n/LocaleProvider'
import { Box, Card, Checkbox, Chip, IconButton, Stack, Typography } from '@mui/material'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import Close from '@mui/icons-material/Close'
import Pause from '@mui/icons-material/Pause'
import PlayArrow from '@mui/icons-material/PlayArrow'
import type { QueueEntry } from '../types'
import { activeItemStyles } from '@/theme/tokens'
import { CurrentTrackLabel } from '@/features/player/CurrentTrackLabel'

export function QueueRow({ entry, index, total, current, playing, disabled, checked, onCheck, onSelect, onRemove, onMove, onDrop }: {
  entry: QueueEntry; index: number; total: number; current: boolean; playing: boolean; disabled: boolean
  checked: boolean; onCheck: () => void
  onSelect: () => void; onRemove: () => void; onMove: (direction: -1 | 1) => void; onDrop: (fromIndex: number, targetIndex: number) => void
}) {
  const lt = useText()

  const label = `${index + 1}. ${entry.display.name}${entry.display.artist ? ` — ${entry.display.artist}` : ''}`
  return <Card component="li" draggable={!disabled} onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
    onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) onDrop(from, index) }}
    aria-label={label} aria-current={current ? 'true' : undefined} sx={{ listStyle: 'none', flexShrink: 0, p: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', ...(current ? activeItemStyles : {}) }}>
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
      <Checkbox size="small" checked={checked} disabled={disabled} onChange={onCheck} slotProps={{ input: { 'aria-label': lt('select', { p0: label }) } }} sx={{ p: 0.5 }} />
      <Typography sx={{ width: 22, flexShrink: 0, textAlign: 'right' }} aria-label={lt('position', { p0: index + 1 })}>{index + 1}</Typography>
      <IconButton size="small" aria-label={`${current && playing ? lt('pause') : lt('play')}: ${label}`} disabled={disabled || entry.availability !== 'playable' || !entry.track?.audio} onClick={onSelect}>
        {current && playing ? <Pause fontSize="small" /> : <PlayArrow fontSize="small" />}
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0, flexBasis: { xs: 'calc(100% - 140px)', sm: 0 } }}>
        <Typography noWrap sx={{ fontWeight: current ? 700 : 400 }}>{entry.display.name}</Typography>
        {current && <CurrentTrackLabel playing={playing} />}
        {entry.source !== 'automatic' && <Chip size="small" label={lt('addedManually')} sx={{ height: 20, maxWidth: '100%', '& .MuiChip-label': { px: 0.75 } }} />}
        <Typography noWrap variant="caption" color={current ? 'var(--wae-textSecondaryStrong)' : 'text.secondary'}>
          {entry.display.artist ?? '—'}{entry.availability === 'unavailable' ? lt('unavailable290', { p0: entry.reason === 'deleted' ? lt('reason_deleted') : entry.reason === 'missing-audio' ? lt('reason_audio_missing') : lt('reason_unavailable') }) : ''}
        </Typography>
      </Box>
      <IconButton size="small" aria-label={lt('moveUp', { p0: label })} disabled={disabled || index === 0} onClick={() => onMove(-1)}><ArrowUpward fontSize="small" /></IconButton>
      <IconButton size="small" aria-label={lt('moveDown', { p0: label })} disabled={disabled || index === total - 1} onClick={() => onMove(1)}><ArrowDownward fontSize="small" /></IconButton>
      <IconButton size="small" aria-label={lt('remove292', { p0: label })} disabled={disabled} onClick={onRemove}><Close fontSize="small" /></IconButton>
    </Stack>
  </Card>
}
