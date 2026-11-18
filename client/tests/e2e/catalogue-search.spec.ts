import { expect, test } from '@playwright/test'

const track = (id: number, name: string) => ({
  _id: id.toString(16).padStart(24, '0'), name, artist: 'Search artist',
  audio: `/audio/track-${id}.mp3`, picture: '', listens: 0, duration: 60,
})

test('search requests start after one debounce interval and coalesce typing', async ({ page }) => {
  const queries: string[] = []
  await page.route('**/api/tracks/search?*', async (route) => {
    queries.push(new URL(route.request().url()).searchParams.get('nameOrArtist') ?? '')
    await route.fulfill({ json: { items: [track(1, 'Found track')], nextCursor: null } })
  })
  await page.goto('/tracks')
  const input = page.getByRole('searchbox', { name: 'Поиск по названию или исполнителю' })
  await expect(input).toBeVisible()
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  await input.fill('Fir')
  await page.clock.runFor(200)
  await input.fill('First')
  await page.clock.runFor(299)
  expect(queries).toEqual([])
  await page.clock.runFor(1)
  // The clock stays paused: an additional debounce in the hook cannot fire.
  await expect.poll(() => queries).toEqual(['First'])
  await expect(page.getByRole('link', { name: 'Found track', exact: true })).toBeVisible()
})

test('aborts old searches and keeps the newest results when an old response arrives late', async ({ page }) => {
  let releaseOld!: () => void
  const oldResponse = new Promise<void>((resolve) => { releaseOld = resolve })
  let oldStarted = false
  await page.route('**/api/tracks/search?*', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('nameOrArtist')
    if (query === 'Old') {
      oldStarted = true
      await oldResponse
    }
    await route.fulfill({ json: { items: [track(1, query === 'Old' ? 'Old result' : 'New result')], nextCursor: null } })
  })
  await page.goto('/tracks')
  const input = page.getByRole('searchbox')
  await input.fill('Old')
  await expect.poll(() => oldStarted).toBe(true)
  const aborted = page.waitForEvent('requestfailed', (request) => request.url().includes('nameOrArtist=Old'))
  await input.fill('New')
  await aborted
  await expect(page.getByRole('link', { name: 'New result', exact: true })).toBeVisible()
  releaseOld()
  await expect(page.getByRole('link', { name: 'Old result', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'New result', exact: true })).toBeVisible()
})

test('retries failed pages, clears search, and restores filters with back and forward', async ({ page }) => {
  let failNextPage = true
  await page.route('**/api/tracks/search?*', async (route) => {
    const params = new URL(route.request().url()).searchParams
    if (params.has('cursor') && failNextPage) {
      failNextPage = false
      await route.fulfill({ status: 503, json: {} })
      return
    }
    const query = params.get('nameOrArtist')
    await route.fulfill({ json: params.has('cursor')
      ? { items: [track(2, 'Second result')], nextCursor: null }
      : { items: [track(1, `${query} result`)], nextCursor: 'next' } })
  })
  await page.goto('/tracks')
  const input = page.getByRole('searchbox')
  await input.fill('First')
  await expect(page.getByRole('link', { name: 'First result', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Загрузить ещё', exact: true }).click()
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByRole('link', { name: 'First result', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Second result', exact: true })).toBeVisible()

  await page.evaluate(() => window.history.pushState(null, '', '/tracks?query=Other'))
  await expect(input).toHaveValue('Other')
  await expect(page.getByRole('link', { name: 'Other result', exact: true })).toBeVisible()
  await page.goBack()
  await expect(input).toHaveValue('First')
  await expect(page.getByRole('link', { name: 'First result', exact: true })).toBeVisible()
  await page.goForward()
  await expect(input).toHaveValue('Other')
  await expect(page.getByRole('link', { name: 'Other result', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click()
  await expect(input).toHaveValue('')
  await expect(page).toHaveURL(/\/tracks$/)
  await expect(page.getByRole('link', { name: 'Track 1', exact: true })).toBeVisible()
})
