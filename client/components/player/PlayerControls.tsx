'use client'

import { keyframes } from '@emotion/react'
import { Alert, Box, Button, IconButton, Slider, Stack, Typography } from '@mui/material'
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
  {only !== 'repeat' && <IconButton onClick={toggleShuffle} aria-label={lt('shufflePlaybackOrder')} aria-pressed={shuffle}><ShuffleRounded /></IconButton>}
  {only !== 'shuffle' && <IconButton onClick={cycleRepeat} aria-label={lt('changeRepeatMode', { p0: repeatLabel })} title={repeatLabel} aria-pressed={repeat !== 'off'}>{repeat === 'one' ? <RepeatOneRounded /> : <RepeatRounded />}</IconButton>}
 </>
}
export function PlaybackControls({ large = false }: { large?: boolean }) {
 const lt = useText()
 const { current, playing, toggle, prev, next } = usePlayerTransport()
 return <Stack direction="row" spacing={large ? 1 : .5} sx={{ alignItems: 'center', justifyContent: 'center' }}>
  <PlaybackModes only="shuffle" />
  <IconButton onClick={prev} disabled={!current} aria-label={lt('previous')}><SkipPreviousRounded fontSize={large ? 'large' : 'medium'} /></IconButton>
  <IconButton onClick={toggle} disabled={!current?.audio} aria-label={playing ? lt('pause') : lt('play')} sx={{ width: large ? 64 : 52, height: large ? 64 : 52, bgcolor: current ? 'var(--wae-accent)' : 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'var(--wae-accentText)' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground' } }}>{playing ? <PauseRounded fontSize={large ? 'large' : 'medium'} /> : <PlayArrowRounded fontSize={large ? 'large' : 'medium'} />}</IconButton>
  <IconButton onClick={next} disabled={!current} aria-label={lt('next')}><SkipNextRounded fontSize={large ? 'large' : 'medium'} /></IconButton>
  <PlaybackModes only="repeat" />
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
      onChange={(_event, value) => seek(Number(value))} disabled={!current?.audio || duration === 0} sx={{ mx: 1, minWidth: 0, color: 'var(--wae-accent)', '& .MuiSlider-track': { height: 4 }, '& .MuiSlider-thumb': { width: 12, height: 12 }, '& .MuiSlider-rail': { bgcolor: 'text.secondary', opacity: .35 } }} />
    <Typography sx={{ ...timeStyle, textAlign: 'right' }}>{formatTime(duration)}</Typography>
  </Stack>
}

// The first 20% of volume gets one third of the slider's travel.
function volumeToPosition(percent: number) {
  return percent <= 20 ? percent * 2 : percent + 20
}

const volumePositionMax = volumeToPosition(100)
const volumeStops = Array.from({ length: 101 }, (_, percent) => ({ value: volumeToPosition(percent) }))
const hiddenVolumeStop = () => null
const volumeSegments = Array.from({ length: 14 }, (_, index) => index)
const volumeRipple = keyframes({
  '50%': { transform: 'scaleY(1.16)', filter: 'brightness(1.25)' },
})

function volumeFromPosition(position: number) {
  return position <= 40 ? position / 2 : position - 20
}

export function VolumeControl() {
  const lt = useText()
  const { muted, volume, toggleMute, setVolume } = usePlayerTransport()
  const percent = Math.round(volume * 100)
  const position = volumeToPosition(percent)
  const formatVolume = (value: number) => `${value}%`

  return <Stack direction="row" spacing={1} sx={{ width: '100%', alignItems: 'center', px: 1 }}>
    <IconButton onClick={toggleMute} aria-label={lt('mute')} aria-pressed={muted} title={muted ? lt('unmute') : lt('mute057')} sx={{ minWidth: 44, minHeight: 44 }}>
      {muted || volume === 0 ? <VolumeOffRounded /> : <VolumeUpRounded />}
    </IconButton>
    <Box sx={{
      minWidth: 0,
      flex: 1,
      position: 'relative',
      '@media (prefers-reduced-motion: no-preference)': {
        '&:has(.MuiSlider-dragging) [data-volume-lit]': {
          animation: `${volumeRipple} 230ms ease-out both`,
          animationDelay: 'var(--volume-segment-delay)',
        },
      },
    }}>
      <Box aria-hidden sx={{
        position: 'absolute', inset: 0, display: 'grid',
        gridTemplateColumns: `repeat(${volumeSegments.length}, minmax(0, 1fr))`,
        alignItems: 'center', gap: '3px', pointerEvents: 'none',
      }}>
        {volumeSegments.map(index => {
          const active = position > 0 && position > (index / volumeSegments.length) * volumePositionMax
          return <Box key={index} data-volume-lit={active && !muted ? '' : undefined} sx={{
            height: 8 + index,
            borderRadius: 1,
            bgcolor: active ? 'var(--wae-accent)' : 'text.secondary',
            opacity: active && !muted ? 1 : 0.35,
            '@media (forced-colors: active)': {
              forcedColorAdjust: 'none',
              bgcolor: active && !muted ? 'Highlight' : 'GrayText',
              opacity: 1,
            },
            '--volume-segment-delay': `${index * 12}ms`,
          }} />
        })}
      </Box>
      <Slider
        aria-label={lt('volume')}
        getAriaValueText={value => muted ? lt('mutedVolumeLevel', { p0: formatVolume(value) }) : formatVolume(value)}
        scale={volumeFromPosition}
        value={position}
        max={volumePositionMax}
        step={null}
        marks={volumeStops}
        slots={{ mark: hiddenVolumeStop }}
        onKeyDownCapture={event => {
          // MUI treats Home and End as single-stop moves with a discrete marks slider.
          if (event.key !== 'Home' && event.key !== 'End') return
          event.preventDefault()
          event.stopPropagation()
          setVolume(event.key === 'Home' ? 0 : 1)
        }}
        track={false}
        valueLabelDisplay="auto"
        valueLabelFormat={formatVolume}
        onChange={(_event, value) => setVolume(volumeFromPosition(Number(value)) / 100)}
        sx={{
          display: 'block', height: 44, boxSizing: 'border-box', '&&': { py: 0 },
          color: 'var(--wae-accent)',
          '& .MuiSlider-rail': { opacity: 0 },
          '& .MuiSlider-thumb': {
            width: 8, height: 8, bgcolor: 'var(--wae-accentText)', border: '1px solid', borderColor: 'background.paper',
            '&::after': { width: 24, height: 24 },
          },
        }}
      />
    </Box>
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
