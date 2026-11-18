export type RGB = readonly [number, number, number]
export type ArtworkPalette = {
  colors: readonly [RGB, RGB, RGB]
  accentCandidates: readonly RGB[]
  dark: boolean
}

export function mix(a: RGB, b: RGB, amount: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * amount),
    Math.round(a[1] + (b[1] - a[1]) * amount),
    Math.round(a[2] + (b[2] - a[2]) * amount),
  ]
}

export const rgb = (color: RGB) => `rgb(${color.join(', ')})`
export const white: RGB = [255, 255, 255]
export const black: RGB = [0, 0, 0]

function linearChannel(value: number) {
  const channel = value / 255
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
}

export function luminance([red, green, blue]: RGB) {
  return .2126 * linearChannel(red) + .7152 * linearChannel(green) + .0722 * linearChannel(blue)
}

export function artworkPalette(pixels: Uint8ClampedArray): ArtworkPalette | null {
  const bins = new Map<number, { sum: [number, number, number], count: number }>()
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5)
    const bin = bins.get(key) ?? { sum: [0, 0, 0], count: 0 }
    bin.sum[0] += r
    bin.sum[1] += g
    bin.sum[2] += b
    bin.count++
    bins.set(key, bin)
  }

  const ordered = [...bins].sort(([a, first], [b, second]) => second.count - first.count || a - b)
  const clusters: { color: RGB, count: number, key: number }[] = []
  for (const [key, { sum, count }] of ordered) {
    const color: RGB = [sum[0] / count, sum[1] / count, sum[2] / count]
    const neighbor = clusters.find(({ color: other }) => Math.hypot(color[0] - other[0], color[1] - other[1], color[2] - other[2]) <= 40)
    if (neighbor) {
      neighbor.color = mix(neighbor.color, color, count / (neighbor.count + count))
      neighbor.count += count
    } else {
      clusters.push({ color: mix(color, color, 0), count, key })
    }
  }

  clusters.sort((a, b) => b.count - a.count || a.key - b.key)
  const [first, second, third] = clusters
  if (!first) return null
  const pole = first.color[0] + first.color[1] + first.color[2] > 382 ? black : white
  const secondary = second?.color ?? mix(first.color, pole, .25)
  const midpoint = mix(first.color, pole, .5)
  const distance = Math.hypot(midpoint[0] - secondary[0], midpoint[1] - secondary[1], midpoint[2] - secondary[2])
  const totalPixels = clusters.reduce((sum, cluster) => sum + cluster.count, 0)
  const averageLight = clusters.reduce((sum, cluster) => sum + luminance(cluster.color) * cluster.count, 0) / totalPixels
  return {
    colors: [first.color, secondary, third?.color ?? (distance < 24 ? mix(first.color, pole, .75) : midpoint)],
    accentCandidates: clusters
      .filter(cluster => cluster.count >= Math.max(4, totalPixels * .02))
      .map(cluster => cluster.color),
    dark: averageLight < .22,
  }
}
