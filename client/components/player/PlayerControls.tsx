'use client'

import type { ReactNode } from 'react'
import { Alert, Button, IconButton, Slider, Stack, Typography } from '@mui/material'
import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded'
import VolumeOffRounded from '@mui/icons-material/VolumeOffRounded'
import RepeatRounded from '@mui/icons-material/RepeatRounded'
import RepeatOneRounded from '@mui/icons-material/RepeatOneRounded'
import ShuffleRounded from '@mui/icons-material/ShuffleRounded'
import PauseRounded from '@mui/icons-material/PauseRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import SkipNextRounded from '@mui/icons-material/SkipNextRounded'
import SkipPreviousRounded from '@mui/icons-material/SkipPreviousRounded'
import { useText, useMessage } from '@/i18n/LocaleProvider'
import { usePlayerProgress, usePlayerTransport } from './PlayerProvider'
import { useQueueStore } from '@/features/queue/hooks'
import { INVALID_GUEST_QUEUE_WARNING, MEMORY_GUEST_QUEUE_WARNING, clearGuestQueue } from '@/features/queue/guestAdapter'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

export function PlaybackModes({ only }: { only?: 'shuffle' | 'repeat' }) {
 const lt = useText()
 const { shuffle, toggleShuffle, repeat, cycleRepeat } = usePlayerTransport()
 const repeatLabel = repeat === 'off' ? lt('repeatOff') : repeat === 'all' ? lt('repeatQueue') : lt('repeatTrack')
 return <>
  {only !== 'repeat' && <IconButton onClick={toggleShuffle} aria-label={lt('shufflePlaybackOrder')} aria-pressed={shuffle} sx={{ bgcolor: shuffle ? 'action.selected' : undefined }}><ShuffleRounded /></IconButton>}
  {only !== 'shuffle' && <IconButton onClick={cycleRepeat} aria-label={lt('changeRepeatMode', { p0: repeatLabel })} title={repeatLabel} aria-pressed={repeat !== 'off'} sx={{ bgcolor: repeat !== 'off' ? 'action.selected' : undefined }}>{repeat === 'one' ? <RepeatOneRounded /> : <RepeatRounded />}</IconButton>}
 </>
}
export function PlaybackControls({ large = false, compact = false, children, actions }: { large?: boolean; compact?: boolean; children?: ReactNode; actions?: ReactNode }) {
 const lt = useText()
 const { current, playing, toggle, prev, next } = usePlayerTransport()
 return <Stack direction="row" spacing={large ? 1 : .5} sx={{ alignItems: 'center', justifyContent: 'center' }}>
  {children}
  {!compact && <PlaybackModes only="shuffle" />}
  <IconButton onClick={prev} disabled={!current} aria-label={lt('previous')}><SkipPreviousRounded fontSize={large ? 'large' : 'medium'} /></IconButton>
  <IconButton onClick={toggle} disabled={!current?.audio} aria-label={playing ? lt('pause') : lt('play')} sx={{ width: large ? 64 : 52, height: large ? 64 : 52, bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground' } }}>{playing ? <PauseRounded fontSize={large ? 'large' : 'medium'} /> : <PlayArrowRounded fontSize={large ? 'large' : 'medium'} />}</IconButton>
  <IconButton onClick={next} disabled={!current} aria-label={lt('next')}><SkipNextRounded fontSize={large ? 'large' : 'medium'} /></IconButton>
  {!compact && <PlaybackModes only="repeat" />}
  {actions}
 </Stack>
}

export function PlaybackProgress({ expanded = false }: { expanded?: boolean }) {
  const lt = useText()
  const { current, seek } = usePlayerTransport()
  const { currentTime, duration } = usePlayerProgress()
  const timeStyle = { fontSize: expanded ? '0.8rem' : '0.7rem', color: 'text.secondary', minWidth: 32, fontVariantNumeric: 'tabular-nums', display: 'block' }
  return <Stack direction="row" spacing={1} sx={{ width: '100%', minWidth: 0, alignItems: 'center' }}>
    <Typography sx={timeStyle}>{formatTime(currentTime)}</Typography>
    <Slider size={expanded ? 'medium' : 'small'} aria-label={lt('playbackPosition')}
      getAriaValueText={(value) => lt('of', { p0: formatTime(value), p1: formatTime(duration) })}
      value={Math.min(currentTime, duration || 0)} max={duration || 1}
      onChange={(_event, value) => seek(Number(value))} disabled={!current?.audio || duration === 0} sx={{ mx: 1, minWidth: 0 }} />
    <Typography sx={{ ...timeStyle, textAlign: 'right' }}>{formatTime(duration)}</Typography>
  </Stack>
}

export function VolumeControl() {
  const lt = useText()
  const { muted, volume, toggleMute, setVolume } = usePlayerTransport()
  return <Stack direction="row" spacing={1} sx={{ width: '100%', alignItems: 'center', px: 1 }}>
    <IconButton onClick={toggleMute} aria-label={lt('mute')} aria-pressed={muted} title={muted ? lt('unmute') : lt('mute057')} sx={{ minWidth: 44, minHeight: 44 }}>
      {muted || volume === 0 ? <VolumeOffRounded /> : <VolumeUpRounded />}
    </IconButton>
    <Slider size="small" aria-label={lt('volume')} getAriaValueText={(value) => `${value}%`} value={Math.round(volume * 100)} max={100}
      onChange={(_event, value) => setVolume(Number(value) / 100)} sx={{ minWidth: 0 }} />
  </Stack>
}

export function PlayerFeedback() {
  const lt = useText()
  const resolve = useMessage()
  const store = useQueueStore()
  const { error, audioError, retrying, retryAudio } = usePlayerTransport()
  if (!error) return null
  return <Alert severity={error === INVALID_GUEST_QUEUE_WARNING || error === MEMORY_GUEST_QUEUE_WARNING ? 'warning' : 'error'}
    action={audioError ? <Button color="inherit" size="small" disabled={retrying} onClick={retryAudio}>{retrying ? lt('retrying') : lt('retryAudio')}</Button> : error === INVALID_GUEST_QUEUE_WARNING ? <Button color="inherit" size="small" onClick={() => { clearGuestQueue(); void store.refresh() }}>{lt('resetGuestQueue')}</Button> : undefined}>{resolve(error)}</Alert>
}
