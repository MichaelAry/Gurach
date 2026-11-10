import { expect, test } from '@playwright/test'

test('persists audio ranges and resumes at the saved position without the audio network', async ({ page, context }) => {
  await page.goto('/tracks')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
  })
  const audio = page.locator('audio')
  await page.getByRole('button', { name: 'Играть Track 1', exact: true }).click()
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.readyState >= 2 && !node.paused)).toBe(true)
  await audio.evaluate((node: HTMLAudioElement) => { node.pause(); node.currentTime = 6 })
  await expect.poll(() => page.evaluate(async () => {
    const cache = await caches.open('gurach-audio-v1')
    return (await cache.keys()).length
  })).toBeGreaterThanOrEqual(2)
  // Persist the real element time even if React's last timeupdate is older.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await page.reload()
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeCloseTo(6, 0)
  expect(await audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(true)
  const url = await audio.getAttribute('src')
  // Disable HTTP cache, then remove the network: only persistent worker blocks
  // can satisfy these explicit ranges after the reload.
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await context.setOffline(true)
  const result = await page.evaluate(async (url) => {
    const response = await fetch(url!, { headers: { Range: 'bytes=96044-176043' } })
    return { status: response.status, range: response.headers.get('Content-Range'), bytes: (await response.arrayBuffer()).byteLength }
  }, url)
  expect(result).toEqual({ status: 206, range: 'bytes 96044-176043/320044', bytes: 80000 })
  // Reload the audio element itself to discard its old in-memory media buffer.
  await audio.evaluate(async (node: HTMLAudioElement) => {
    node.load()
    await new Promise<void>((resolve) => node.addEventListener('loadedmetadata', () => resolve(), { once: true }))
    node.currentTime = 6
    await node.play()
  })
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime), { timeout: 10_000 }).toBeGreaterThan(11)
  await context.setOffline(false)
})

test('keeps a window near the middle of a long track and fetches uncached ranges online', async ({ page, context }) => {
  await page.goto('/tracks')
  await expect(page.getByRole('button', { name: 'Играть Track 1', exact: true })).toBeVisible()
  const url = await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
    // Read the fixture origin from the same catalog data the player uses.
    const tracks = await fetch('/api/tracks?count=1').then((response) => response.json())
    const url = tracks.items[0].audio.replace(/track-\d+\.mp3$/, 'track-121.mp3') as string
    navigator.serviceWorker.controller!.postMessage({ type: 'audio-lookahead', url, position: 90, duration: 180 })
    return url
  })
  await expect.poll(() => page.evaluate(async () => {
    const keys = await (await caches.open('gurach-audio-v1')).keys()
    return keys.filter((entry) => new URL(entry.url).searchParams.get('url')?.endsWith('track-121.mp3')).length
  })).toBe(5)
  await context.setOffline(true)
  const bytes = await page.evaluate(async (url) => {
    const response = await fetch(url, { headers: { Range: 'bytes=1440044-1520043' } })
    return (await response.arrayBuffer()).byteLength
  }, url)
  expect(bytes).toBe(80000)
  expect(await page.evaluate(async (url) => {
    try { await fetch(url, { headers: { Range: 'bytes=524288-524300' } }); return true } catch { return false }
  }, url)).toBe(false)
  await context.setOffline(false)
  expect(await page.evaluate(async (url) => {
    const response = await fetch(url, { headers: { Range: 'bytes=524288-524300' } })
    return { status: response.status, bytes: (await response.arrayBuffer()).byteLength }
  }, url)).toEqual({ status: 206, bytes: 13 })
})
