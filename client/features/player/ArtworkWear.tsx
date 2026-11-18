'use client'

import { memo, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Button, Stack, Typography } from '@mui/material'
import { useText } from '@/i18n/LocaleProvider'
import { useViewer } from '@/features/auth/ViewerProvider'
import { useListenRevision } from '@/features/tracks/components/ListenCountsProvider'
import type { components } from '@/lib/api/schema'
import { artworkWearLevel, artworkWearPattern, guestWearChanged, guestWearCount, guestWearIdentity, saveGuestWear } from './artworkWear'

async function accountWear(trackId: string, method: 'GET' | 'PUT', signal: AbortSignal) {
  const response = await fetch(`/api/account/artwork-wear/${encodeURIComponent(trackId)}`, {
    method, signal, headers: { 'X-Gurach-Request': '1' },
  })
  if (!response.ok) throw new Error('Artwork wear unavailable')
  const { count } = await response.json() as components['schemas']['ArtworkWear']
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid artwork wear')
  return count
}

type Props = { trackId?: string; record: ReactNode; artwork: ReactNode }

export function ArtworkWear({ trackId, record, artwork }: Props) {
  const { confirmed, user } = useViewer()
  if (!trackId || !confirmed) {
    return <Turntable record={record} artwork={artwork} />
  }
  return <PersonalArtwork key={`${user?.id ?? 'guest'}:${trackId}`} identity={user?.id ?? null}
    trackId={trackId} record={record} artwork={artwork} />
}

function Turntable({ record, artwork, wear }: { record: ReactNode; artwork: ReactNode; wear?: ReactNode }) {
  return <div className="fullscreen-player-turntable">
    <div className="fullscreen-player-record" aria-hidden="true"><div className="fullscreen-player-recordLabel">
      {record}
    </div></div>
    <div className="fullscreen-player-sleeve">{artwork}{wear}</div>
  </div>
}

const WearMarks = memo(function WearMarks({ identity, trackId, level }: { identity: string; trackId: string; level: number }) {
  return <span aria-hidden="true" className="artwork-wear-marks" data-wear-level={level}
    style={artworkWearPattern(identity, trackId) as CSSProperties} />
})

const degree = ['artworkWearFresh', 'artworkWearLight', 'artworkWearMedium', 'artworkWearHeavy'] as const

function PersonalArtwork({ trackId, identity, record, artwork }: Required<Props> & { identity: string | null }) {
  const lt = useText()
  const { isConfirmed } = useViewer()
  const listenRevision = useListenRevision()
  const revision = identity ? listenRevision : 0
  const [wear, setWear] = useState<{ count: number; seed: string } | null>(null)
  const count = wear?.count ?? null
  const [showCopy, setShowCopy] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [resetError, setResetError] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (resetting) return
    const controller = new AbortController()
    const read = async () => {
      try {
        const seed = identity ?? guestWearIdentity(window.localStorage)
        const value = identity
          ? await accountWear(trackId, 'GET', AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
          : guestWearCount(window.localStorage, trackId)
        if (!controller.signal.aborted && isConfirmed(identity)) {
          setWear({ count: value, seed })
          setLoadError(false)
        }
      } catch {
        if (!controller.signal.aborted && isConfirmed(identity)) {
          setWear(null)
          setLoadError(true)
        }
      }
    }
    void read()
    if (!identity) {
      window.addEventListener(guestWearChanged, read)
      window.addEventListener('storage', read)
    }
    return () => {
      controller.abort()
      window.removeEventListener(guestWearChanged, read)
      window.removeEventListener('storage', read)
    }
  }, [identity, trackId, revision, refresh, resetting, isConfirmed])

  async function reset() {
    if (resetting || !isConfirmed(identity)) return
    setResetting(true)
    setResetError(false)
    try {
      if (identity) {
        const value = await accountWear(trackId, 'PUT', AbortSignal.timeout(15000))
        if (isConfirmed(identity)) setWear({ count: value, seed: identity })
      } else {
        await saveGuestWear(trackId, null, () => isConfirmed(null))
        if (isConfirmed(null)) setWear(previous => previous && { ...previous, count: 0 })
      }
    } catch {
      if (isConfirmed(identity)) setResetError(true)
    } finally {
      setResetting(false)
    }
  }

  const level = artworkWearLevel(count ?? 0)
  return <div>
    <Turntable record={record} artwork={artwork} wear={showCopy && wear && level > 0
      ? <WearMarks identity={wear.seed} trackId={trackId} level={level} /> : undefined} />
    <Stack component="section" aria-label={lt('artworkWearCopy')} spacing={0.25} sx={{
      mt: 1, alignItems: 'flex-start',
      '& .MuiButton-root.Mui-focusVisible': { outline: '2px solid currentColor', outlineOffset: -2 },
    }}>
      <Typography variant="caption" role="status">
        {lt(resetError ? 'artworkWearResetError' : loadError ? 'artworkWearLoadError'
          : resetting ? 'artworkWearResetting' : count === null ? 'artworkWearLoading' : degree[level])}
      </Typography>
      {loadError ? <Button size="small" onClick={() => setRefresh(value => value + 1)}>{lt('artworkWearRetry')}</Button>
        : count !== null && <Stack direction="row" sx={{ flexWrap: 'wrap' }}>
          <Button size="small" aria-pressed={showCopy} sx={{ minHeight: 44 }} onClick={() => setShowCopy(true)}>{lt('artworkWearCopy')}</Button>
          <Button size="small" aria-pressed={!showCopy} sx={{ minHeight: 44 }} onClick={() => setShowCopy(false)}>{lt('artworkWearOriginal')}</Button>
          <Button size="small" disabled={resetting || level === 0} sx={{ minHeight: 44 }} onClick={() => void reset()}>{lt('artworkWearReset')}</Button>
        </Stack>}
    </Stack>
  </div>
}
