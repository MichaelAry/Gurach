import { expect, test } from '@playwright/test'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64')

test('loads small list covers lazily, reserves space, and keeps current artwork eager', async ({ page }) => {
  const requested: string[] = []
  await page.route('**/static/picture/*', async (route) => {
    requested.push(route.request().url())
    if (route.request().url().includes('cover-2.png')) await route.fulfill({ status: 404 })
    else await route.fulfill({ contentType: 'image/png', body: png })
  })
  // Queue hydration resolves canonical track metadata through a separate API.
  await page.route('**/api/tracks/resolve', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    for (const item of body.items) {
      if (item.track) {
        const number = parseInt(item.track._id, 16)
        item.track.picture = `http://127.0.0.1:5300/static/picture/cover-${number}.png`
      }
    }
    await route.fulfill({ response, json: body })
  })
  await page.route('**/api/tracks/search?*', (route) => route.fulfill({ json: {
    items: Array.from({ length: 100 }, (_, index) => ({
      _id: (index + 1).toString(16).padStart(24, '0'), name: `Artwork ${index + 1}`, artist: 'Artist',
      audio: 'http://127.0.0.1:5300/static/audio/track-1.mp3',
      picture: `http://127.0.0.1:5300/static/picture/cover-${index + 1}.png`, duration: 180, listens: 0,
    })), nextCursor: null,
  } }))
  await page.goto('/tracks?query=Artwork')
  const first = page.locator('img[src*="cover-1.png"]').first()
  await expect(first).toBeVisible()
  await expect(first).toHaveAttribute('loading', 'lazy')
  await expect(first).toHaveAttribute('decoding', 'async')
  await expect(first).toHaveAttribute('width', '48')
  await expect(first).toHaveAttribute('height', '48')
  await expect(first).toHaveAttribute('srcset', /size=96 2x/)
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  expect(await first.boundingBox()).toMatchObject({ width: 48, height: 48 })
  expect(requested.some((url) => url.includes('cover-100.png'))).toBe(false)
  expect(requested.every((url) => new URL(url).searchParams.get('size') === '48')).toBe(true)
  const broken = page.locator('.fullscreen-player-artwork').filter({ has: page.locator('img[src*="cover-2.png"]') })
  await expect(broken).toHaveCount(0)
  await expect(page.locator('.fullscreen-player-artwork[data-placeholder]').first()).toBeVisible()

  const last = page.locator('img[src*="cover-100.png"]').first()
  await last.scrollIntoViewIfNeeded()
  await expect.poll(() => last.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  await page.getByRole('button', { name: 'Играть Artwork 100', exact: true }).click()
  await expect(page.getByRole('contentinfo').locator('img')).toHaveAttribute('loading', 'eager')
  await page.getByRole('button', { name: 'Открыть полноэкранный плеер' }).click()
  const sleeve = page.locator('.fullscreen-player-sleeve img')
  await expect(sleeve).toBeVisible()
  await expect(sleeve).toHaveAttribute('loading', 'eager')
  await expect(sleeve).toHaveAttribute('src', 'http://127.0.0.1:5300/static/picture/cover-100.png')
  await expect(sleeve).not.toHaveAttribute('srcset')
  await expect.poll(() => sleeve.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
})
