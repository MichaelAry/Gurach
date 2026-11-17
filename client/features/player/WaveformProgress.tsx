'use client'

import { useEffect, useState } from 'react'
import { Box, Slider, Typography } from '@mui/material'
import { useText } from '@/i18n/LocaleProvider'
import { usePlayerProgress, usePlayerTransport } from './PlayerProvider'
import { loadWaveform } from './waveform'

function time(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`
}

export function WaveformProgress() {
  const lt = useText()
  const { current, seek } = usePlayerTransport()
  const { currentTime, duration } = usePlayerProgress()
  const [analysis, setAnalysis] = useState<{ url: string; peaks: number[] } | null>(null)
  const url = current?.audio
  useEffect(() => {
    // Bound work for long recordings and unavailable metadata. Playback never waits.
    if (!url || duration <= 0 || duration > 600) return
    const controller = new AbortController()
    void loadWaveform(url, controller.signal).then(peaks => {
      if (!controller.signal.aborted) setAnalysis({ url, peaks })
    }).catch(() => { /* A normal seek line remains available without analysis. */ })
    return () => controller.abort()
  }, [url, duration])
  const peaks = analysis && analysis.url === url ? analysis.peaks : null
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0

  return <Box className="fullscreen-player-progress">
    <Box className="fullscreen-player-wave" data-waveform={peaks ? 'ready' : 'fallback'}>
      {peaks && <div className="fullscreen-player-bars" aria-hidden="true">{peaks.map((peak, index) => <span key={index}
        data-played={index / peaks.length <= progress} style={{ height: `${4 + peak * 40}px` }} />)}</div>}
      <Slider className={peaks ? 'fullscreen-player-waveSlider' : undefined} aria-label={lt('playbackPosition')}
        getAriaValueText={value => lt('of', { p0: time(value), p1: time(duration) })}
        value={Math.min(currentTime, duration || 0)} max={duration || 1} step={1}
        onChange={(_event, value) => seek(Number(value))} disabled={!current?.audio || duration === 0}
        sx={{ color: 'var(--player-accent)', py: '22px', '& .MuiSlider-thumb': { width: 12, height: 12 } }} />
    </Box>
    <Box className="fullscreen-player-times"><Typography variant="caption">{time(currentTime)}</Typography><Typography variant="caption">{time(duration)}</Typography></Box>
  </Box>
}
