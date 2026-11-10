// Audio remains playable if workers or persistent browser storage are unavailable.
let registration: Promise<ServiceWorkerRegistration | null> | undefined
export function prepareAudioCache() {
  if (!registration) registration = (async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return null
    try {
      await navigator.serviceWorker.register('/audio-cache-worker.js', { scope: '/' })
      return await navigator.serviceWorker.ready
    } catch { return null }
  })()
  return registration
}

export function cacheAudioAhead(url: string, position: number, duration: number) {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return
  void prepareAudioCache().then((registration) => {
    registration?.active?.postMessage({ type: 'audio-lookahead', url, position, duration })
  })
}
