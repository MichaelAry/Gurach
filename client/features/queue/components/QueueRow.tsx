'use client'
import { Box, Card, Checkbox, Chip, IconButton, Stack, Typography } from '@mui/material'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import Close from '@mui/icons-material/Close'
import Pause from '@mui/icons-material/Pause'
import PlayArrow from '@mui/icons-material/PlayArrow'
import type { QueueEntry } from '../types'

export function QueueRow({ entry, index, total, current, playing, disabled, checked, onCheck, onSelect, onRemove, onMove, onDrop }: {
  entry: QueueEntry; index: number; total: number; current: boolean; playing: boolean; disabled: boolean
  checked: boolean; onCheck: () => void
  onSelect: () => void; onRemove: () => void; onMove: (direction: -1 | 1) => void; onDrop: (fromIndex: number, targetIndex: number) => void
}) {
  const label = `${index + 1}. ${entry.display.name}${entry.display.artist ? ` — ${entry.display.artist}` : ''}`
  return <Card component="li" draggable={!disabled} onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
    onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) onDrop(from, index) }}
    aria-label={label} aria-current={current ? 'true' : undefined} sx={{ listStyle: 'none', p: 1, border: '1px solid', borderColor: current ? 'primary.main' : 'divider', bgcolor: current ? 'action.selected' : 'background.paper' }}>
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <Checkbox size="small" checked={checked} disabled={disabled} onChange={onCheck} slotProps={{ input: { 'aria-label': `Выбрать: ${label}` } }} sx={{ p: 0.5 }} />
      <Typography sx={{ width: 22, flexShrink: 0, textAlign: 'right' }} aria-label={`Позиция ${index + 1}`}>{index + 1}</Typography>
      <IconButton size="small" aria-label={`${current && playing ? 'Пауза' : 'Играть'}: ${label}`} disabled={disabled || entry.availability !== 'playable' || !entry.track?.audio} onClick={onSelect}>
        {current && playing ? <Pause fontSize="small" /> : <PlayArrow fontSize="small" />}
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: current ? 700 : 400 }}>{entry.display.name}</Typography>
        {entry.source !== 'automatic' && <Chip size="small" label="Добавлен вручную" sx={{ height: 20, maxWidth: '100%', '& .MuiChip-label': { px: 0.75 } }} />}
        <Typography noWrap variant="caption" color="text.secondary">
          {entry.display.artist ?? '—'}{entry.availability === 'unavailable' ? ` · Недоступен (${entry.reason ?? 'причина неизвестна'})` : ''}
        </Typography>
      </Box>
      <IconButton size="small" aria-label={`Выше: ${label}`} disabled={disabled || index === 0} onClick={() => onMove(-1)}><ArrowUpward fontSize="small" /></IconButton>
      <IconButton size="small" aria-label={`Ниже: ${label}`} disabled={disabled || index === total - 1} onClick={() => onMove(1)}><ArrowDownward fontSize="small" /></IconButton>
      <IconButton size="small" aria-label={`Убрать: ${label}`} disabled={disabled} onClick={onRemove}><Close fontSize="small" /></IconButton>
    </Stack>
  </Card>
}
