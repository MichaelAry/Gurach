import { afterEach, expect, it, vi } from 'vitest'
import { loadWaveform } from './waveform'

afterEach(() => vi.unstubAllGlobals())

function decoder(channels: Float32Array[]) {
  const decode = vi.fn(async () => ({ numberOfChannels: channels.length, getChannelData: (index: number) => channels[index] }))
  vi.stubGlobal('OfflineAudioContext', class { decodeAudioData = decode })
  return decode
}

it('keeps audible antiphase stereo peaks and reuses the small analysis instead of downloading again', async () => {
  decoder([new Float32Array(880).fill(1), new Float32Array(880).fill(-1)])
  const request = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
  vi.stubGlobal('fetch', request)
  const peaks = await loadWaveform('/stereo.mp3', new AbortController().signal)
  expect(peaks).toHaveLength(88)
  expect(peaks.every(value => value === 1)).toBe(true)
  expect(await loadWaveform('/stereo.mp3', new AbortController().signal)).toEqual(peaks)
  expect(request).toHaveBeenCalledTimes(1)
})

it('represents silence with finite zero values', async () => {
  decoder([new Float32Array(880)])
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1])))
  const peaks = await loadWaveform('/silence.mp3', new AbortController().signal)
  expect(peaks.every(value => value === 0)).toBe(true)
})

it('cancels oversized downloads before allocating a decoder', async () => {
  const decode = decoder([])
  const cancel = vi.fn()
  vi.stubGlobal('fetch', async () => new Response(new ReadableStream({ cancel }), { headers: { 'content-length': String(13 * 1024 * 1024) } }))
  await expect(loadWaveform('/large.mp3', new AbortController().signal)).rejects.toThrow()
  expect(cancel).toHaveBeenCalledOnce()
  expect(decode).not.toHaveBeenCalled()
})

it('ignores decoding results when a track is left mid-analysis', async () => {
  const controller = new AbortController()
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1])))
  vi.stubGlobal('OfflineAudioContext', class {
    decodeAudioData = async () => { controller.abort(); return { numberOfChannels: 0 } }
  })
  await expect(loadWaveform('/cancelled.mp3', controller.signal)).rejects.toThrow()
})
