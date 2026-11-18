import { expect, test } from '@playwright/test'

test('downloads from catalogue, track page and fullscreen player without interrupting playback', async ({ page }) => {
  await page.goto('/login?returnTo=/tracks')
  await page.getByLabel('Имя пользователя').fill('fixture_user')
  await page.getByLabel('Пароль').fill('fixture password long')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/\/tracks$/)
  await page.getByRole('main').getByRole('button', { name: 'Играть Track 1', exact: true }).click()
  const audio = page.locator('audio')
  const footer = page.getByRole('contentinfo')
  await expect(footer.getByText('1 / 3', { exact: true })).toBeVisible()
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => !node.paused)).toBe(true)
  const track2 = page.getByRole('link', { name: 'Track 2', exact: true })
  const downloadFrom = async (link: ReturnType<typeof track2.getByRole>) => {
    const before = page.url()
    const pending = page.waitForEvent('download')
    await link.click()
    const download = await pending
    expect(download.suggestedFilename()).toBe('Track 2 - Artist 2.mp3')
    expect(await download.failure()).toBeNull()
    expect(download.url()).toMatch(/\/api\/tracks\/[a-f0-9]{24}\/download$/)
    expect(page.url()).toBe(before)
  }
  await downloadFrom(page.locator('.MuiCard-root').filter({ has: track2 }).getByRole('link', { name: 'Скачать трек' }))
  await expect(audio).toHaveAttribute('src', /track-1\.mp3$/)
  await expect(footer.getByText('1 / 3', { exact: true })).toBeVisible()
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => !node.paused)).toBe(true)
  await track2.click()
  await expect(page.getByRole('heading', { name: 'Track 2', exact: true })).toBeVisible()
  await downloadFrom(page.getByRole('main').getByRole('link', { name: 'Скачать трек' }))

  await page.getByRole('main').getByRole('button', { name: 'Слушать', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть полноэкранный плеер' }).click()
  await expect(page).toHaveURL(/\/player\?returnTo=/)
  await expect(page.getByRole('heading', { name: 'Track 2', exact: true })).toBeVisible()
  await downloadFrom(page.getByRole('main').getByRole('link', { name: 'Скачать трек' }))
  await expect(audio).toHaveAttribute('src', /track-2\.mp3$/)
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => !node.paused)).toBe(true)
})

test('returns an attachment when the audio origin sends an inline response', async ({ request }) => {
  const response = await request.get('/api/tracks/000000000000000000000002/download')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-disposition']).toBe("attachment; filename*=UTF-8''Track%202%20-%20Artist%202.mp3")
  expect(response.headers()['content-type']).toBe('application/octet-stream')
  expect((await response.body()).subarray(0, 4).toString()).toBe('RIFF')
  expect((await request.get('/api/tracks/ffffffffffffffffffffffff/download')).status()).toBe(404)
})
