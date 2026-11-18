import { useEffect, useState } from 'react'
import { artworkPalette, type ArtworkPalette } from './artworkPalette'

const cache = new Map<string, ArtworkPalette>()

async function loadPalette(url: string) {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = url
  await image.decode()
  const scale = Math.min(1, 64 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return artworkPalette(context.getImageData(0, 0, canvas.width, canvas.height).data)
}

export function useArtworkPalette(url?: string | null) {
  const [palette, setPalette] = useState<ArtworkPalette | null>(null)
  useEffect(() => {
    let active = true
    const result = cache.get(url ?? '')
    const pending = !url || result ? Promise.resolve(result ?? null) : loadPalette(url).catch(() => null)
    void pending.then(value => {
      if (!active) return
      if (url && value) {
        cache.delete(url)
        cache.set(url, value)
        const oldest = cache.keys().next().value
        if (cache.size > 64 && oldest) cache.delete(oldest)
      }
      setPalette(value)
    })
    return () => { active = false }
  }, [url])
  return url ? palette : null
}
