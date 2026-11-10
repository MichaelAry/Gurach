import { expect, test } from '@playwright/test'

const trackId = (number: number) => number.toString(16).padStart(24, '0')

test('loads comment pages independently and appends without duplicates', async ({ page }) => {
  await page.goto(`/tracks/${trackId(1)}`)

  await expect(page.getByRole('heading', { name: 'Track 1' })).toBeVisible()
  const comments = page.getByRole('region', { name: 'Комментарии' })
  await expect(comments.getByText('Listener 1 · 8/10', { exact: true })).toBeVisible()
  await expect(comments.getByText('Дата неизвестна')).toBeVisible()
  await expect(comments.getByText('Listener 21 · 8/10', { exact: true })).toHaveCount(0)

  await comments.getByRole('button', { name: 'Показать ещё комментарии' }).click()
  await expect(comments.getByRole('alert')).toContainText('BACKEND_UNAVAILABLE')
  await expect(comments.getByText('Listener 1 · 8/10', { exact: true })).toHaveCount(1)
  await comments.getByRole('button', { name: 'Повторить загрузку' }).click()
  await expect(comments.getByText('Listener 21 · 8/10', { exact: true })).toBeVisible()
  await expect(comments.getByText('Listener 1 · 8/10', { exact: true })).toHaveCount(1)

  await comments.getByRole('button', { name: 'Показать ещё комментарии' }).click()
  await expect(comments.getByText('Listener 45 · 8/10', { exact: true })).toBeVisible()
  await expect(comments.getByRole('button', { name: 'Показать ещё комментарии' })).toHaveCount(0)
})

test('shows empty and retryable error states without hiding the track', async ({ page }) => {
  await page.goto(`/tracks/${trackId(3)}`)
  await expect(page.getByRole('heading', { name: 'Track 3' })).toBeVisible()
  await expect(page.getByText('Пока нет комментариев.')).toBeVisible()

  await page.goto(`/tracks/${trackId(2)}`)
  await expect(page.getByRole('heading', { name: 'Track 2' })).toBeVisible()
  const comments = page.getByRole('region', { name: 'Комментарии' })
  await expect(comments.getByRole('alert')).toContainText('BACKEND_UNAVAILABLE')
  await comments.getByRole('button', { name: 'Повторить' }).click()
  await expect(comments.getByRole('alert')).toBeVisible()
})
