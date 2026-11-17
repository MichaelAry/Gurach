const MAX_BYTES = 12 * 1024 * 1024
const BAR_COUNT = 88
const cache = new Map<string, number[]>()

/** Optional analysis uses a separate decoder, never the playing media element. */
export async function loadWaveform(url: string, signal: AbortSignal): Promise<number[]> {
  const cached = cache.get(url)
  if (cached) return cached
  const response = await fetch(url, { signal, credentials: 'omit' })
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) {
    await response.body?.cancel()
    throw new Error('Waveform unavailable')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new Error('Waveform too large')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  signal.throwIfAborted()
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const context = new OfflineAudioContext(1, 1, 8000)
  const audio = await context.decodeAudioData(bytes.buffer)
  signal.throwIfAborted()
  const peaks = Array<number>(BAR_COUNT).fill(0)
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel)
    for (let bar = 0; bar < BAR_COUNT; bar++) {
      const start = Math.floor(bar * samples.length / BAR_COUNT)
      const end = Math.floor((bar + 1) * samples.length / BAR_COUNT)
      let sum = 0
      for (let index = start; index < end; index++) sum += samples[index] ** 2
      peaks[bar] = Math.max(peaks[bar], Math.sqrt(sum / Math.max(1, end - start)))
    }
  }
  const maximum = Math.max(...peaks)
  const normalized = peaks.map(value => maximum ? value / maximum : 0)
  if (cache.size >= 6) cache.delete(cache.keys().next().value!)
  cache.set(url, normalized)
  return normalized
}
