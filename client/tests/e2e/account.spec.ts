import { expect, test, type Locator } from '@playwright/test'

function metric(statistics: Locator, name: string) {
  return statistics.getByText(name, { exact: true }).locator('..').locator('dd')
}

test('opens the account after login and shows statistics, owned pages, and unavailable history', async ({ page }) => {
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Мой аккаунт' })).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?returnTo=\/account$/)
  await page.getByLabel('Имя пользователя').fill('fixture_user')
  await page.getByLabel('Пароль').fill('fixture password long')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByText('@fixture_user', { exact: true })).toBeVisible()
  const statistics = page.getByRole('main').getByRole('region', { name: 'Статистика' })
  await expect(metric(statistics, 'Загружено треков')).toHaveText('21')
  const uploads = page.getByRole('main').getByRole('region', { name: 'Мои загрузки' })
  await expect(uploads.getByRole('link', { name: 'Track 20', exact: true })).toBeVisible()
  await expect(uploads.getByRole('link', { name: 'Track 21', exact: true })).toHaveCount(0)
  await uploads.getByRole('button', { name: 'Показать ещё' }).click()
  await expect(uploads.getByRole('link', { name: 'Track 21', exact: true })).toBeVisible()
  await expect(uploads.getByRole('button', { name: 'Показать ещё' })).toHaveCount(0)
  const history = page.getByRole('main').getByRole('region', { name: 'Недавно слушал' })
  await expect(history.getByRole('link', { name: 'Track 1', exact: true })).toBeVisible()
  await expect(history.getByText('Трек недоступен', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('retries failed statistics and shows an empty account for a different user', async ({ page }) => {
  let fail = true
  await page.route('**/api/account/statistics', async (route) => {
    if (fail) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    else await route.continue()
  })
  await page.goto('/login?returnTo=/account')
  await page.getByLabel('Имя пользователя').fill('fixture_other')
  await page.getByLabel('Пароль').fill('fixture password long')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
  const statistics = page.getByRole('main').getByRole('region', { name: 'Статистика' })
  await expect(statistics.getByRole('alert')).toBeVisible()
  fail = false
  await statistics.getByRole('button', { name: 'Повторить' }).click()
  await expect(statistics.getByRole('alert')).toHaveCount(0)
  for (const name of ['Загружено треков', 'Прослушано треков', 'Уникальных треков прослушано', 'Прослушиваний моих загрузок', 'Оставлено комментариев', 'Избранных треков', 'Друзей']) {
    await expect(metric(statistics, name)).toHaveText('0')
  }
  await expect(page.getByText('Вы ещё не загрузили ни одного трека.', { exact: true })).toBeVisible()
  await expect(page.getByText(/Вы ещё не прослушали ни одного трека/)).toBeVisible()
  await expect(page.getByText('@fixture_user', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Открыть треки', exact: true }).click()
  await page.getByRole('button', { name: 'Играть Track 2', exact: true }).click()
  const audio = page.locator('audio')
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => !node.paused)).toBe(true)
  await audio.evaluate((node: HTMLAudioElement) => { node.playbackRate = 4 })
  await page.getByRole('link', { name: 'Мой аккаунт', exact: true }).click()
  await expect(metric(statistics, 'Прослушано треков')).toHaveText('1', { timeout: 10_000 })
  await expect(metric(statistics, 'Уникальных треков прослушано')).toHaveText('1')
  await expect(page.getByRole('main').getByRole('region', { name: 'Недавно слушал' }).getByRole('link', { name: 'Track 2', exact: true })).toBeVisible()
  await page.getByRole('contentinfo').getByRole('button', { name: 'Пауза', exact: true }).click()
})
