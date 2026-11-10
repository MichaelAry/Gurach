import { expect, test } from '@playwright/test'

test('paginates 121 tracks while queue playback remains independent from catalogue pages', async ({ page }) => {
  await page.goto('/tracks')

  await expect(page.getByRole('link', { name: 'Track 1', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Track 20', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Track 21', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Загрузить ещё' }).click()
  await expect(page.getByRole('link', { name: 'Track 40', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Track 41', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Играть Track 1', exact: true }).click()
  const audio = page.locator('audio')
  await expect(audio).toHaveAttribute('src', /track-1\.mp3$/)
  const selectedSource = await audio.getAttribute('src')
  await expect(page.getByRole('contentinfo').getByText('Track 1', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Загрузить ещё' }).click()
  await expect(page.getByRole('link', { name: 'Track 41', exact: true })).toBeVisible()
  await expect(audio).toHaveAttribute('src', selectedSource ?? '')
  const footer = page.getByRole('contentinfo')
  await expect(footer.getByText('1 / 50')).toBeVisible()

  for (let pageNumber = 0; pageNumber < 3; pageNumber += 1) {
    await page.getByRole('button', { name: 'Загрузить ещё' }).click()
  }
  await expect(page.getByRole('link', { name: 'Track 120', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Играть Track 21', exact: true }).click()
  await expect(audio).toHaveAttribute('src', /track-21\.mp3$/)
  await expect(footer.getByText('21 / 50')).toBeVisible()

  await page.getByRole('button', { name: 'Играть Track 101', exact: true }).click()
  await expect(audio).toHaveAttribute('src', /track-101\.mp3$/)
  const lateTrackSource = await audio.getAttribute('src')
  await expect(footer.getByText('22 / 51')).toBeVisible()

  await page.getByRole('button', { name: 'Загрузить ещё' }).click()
  await expect(page.getByRole('link', { name: 'Track 121', exact: true })).toBeVisible()
  await expect(audio).toHaveAttribute('src', lateTrackSource ?? '')
  await expect(footer.getByText('22 / 51')).toBeVisible()
  await expect(page.getByText('Все треки загружены.')).toBeVisible()
})
