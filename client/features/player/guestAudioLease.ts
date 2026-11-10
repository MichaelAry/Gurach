const LOCK_NAME = 'gurach:guest-audio-owner'
let ownsLease = false
let releaseLease: (() => void) | null = null

/** Prevents two coordinated guest tabs from playing audio simultaneously. */
export async function acquireGuestAudioLease(): Promise<boolean> {
  if (ownsLease) return true
  if (typeof navigator === 'undefined' || !navigator.locks) return true
  let resolveAttempt!: (value: boolean) => void
  const acquired = new Promise<boolean>((resolve) => { resolveAttempt = resolve })
  void navigator.locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (!lock) { resolveAttempt(false); return }
    ownsLease = true
    resolveAttempt(true)
    await new Promise<void>((resolve) => { releaseLease = resolve })
    ownsLease = false
    releaseLease = null
  }).catch(() => resolveAttempt(false))
  return acquired
}

export function releaseGuestAudioLease() {
  releaseLease?.()
}
