import { expect, test, type Page } from '@playwright/test'

const origin = 'http://127.0.0.1:3200'
const headers = { origin, 'X-Gurach-Request': '1' }
async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Username').fill('fixture_user')
  await page.getByLabel('Password').fill('fixture password long')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
}

test.beforeEach(async ({ context }) => { await context.clearCookies() })

test('defaults to English, preserves search, updates server text and persists Russian across reloads', async ({ page, context }) => {
  await page.goto('/tracks?query=Track')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { name: 'Track list', exact: true })).toBeVisible()
  await expect(page.getByLabel('Search by title or artist')).toHaveValue('Track')
  await page.getByRole('button', { name: 'Русский', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Список треков', exact: true })).toBeVisible()
  await expect(page.getByLabel('Поиск по названию или исполнителю')).toHaveValue('Track')
  await expect(page).toHaveURL(/query=Track/)
  await expect(page).toHaveTitle('Треки')
  expect((await context.cookies()).find(cookie => cookie.name === 'NEXT_LOCALE')?.value).toBe('ru')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await expect(page.getByRole('heading', { name: 'Список треков', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Track list', exact: true })).toBeVisible()
  await expect(page).toHaveTitle('Tracks')
  await expect(page.locator('body')).not.toContainText('~i18n:')
})

test('switches existing errors and keeps form values on the auth screen', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username').fill('fixture_user')
  await page.getByLabel('Password').fill('wrong password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('.MuiAlert-root[role=alert]:visible')).toContainText('Incorrect username or password.')
  await page.getByRole('button', { name: 'Русский', exact: true }).click()
  await expect(page.locator('.MuiAlert-root[role=alert]:visible')).toContainText('Неверное имя пользователя или пароль.')
  await expect(page.getByLabel('Имя пользователя')).toHaveValue('fixture_user')
  await expect(page.getByLabel('Пароль')).toHaveValue('wrong password')
})

test('synchronizes guest tabs and keeps the active audio element and queue', async ({ page, context }) => {
  await page.goto('/tracks')
  const play = page.getByRole('button', { name: 'Play Track 1', exact: true })
  await expect(play).toBeEnabled()
  await play.click()
  await expect(page.locator('audio')).toHaveAttribute('src', /track-1\.mp3$/)
  await page.locator('audio').evaluate(node => { (node as HTMLAudioElement & { localeTest?: string }).localeTest = 'preserved' })
  const other = await context.newPage()
  await other.goto('/tracks')
  await other.getByRole('button', { name: 'Русский', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await expect(page.getByRole('heading', { name: 'Список треков', exact: true })).toBeVisible()
  expect(await page.locator('audio').evaluate(node => (node as HTMLAudioElement & { localeTest?: string }).localeTest)).toBe('preserved')
  await expect(page.locator('audio')).toHaveAttribute('src', /track-1\.mp3$/)
  await expect(page.getByRole('contentinfo').getByText('Track 1', { exact: true })).toBeVisible()
})

test('saves an account preference, restores it in a new browser and keeps local selection when saving fails', async ({ page, context, browser }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Русский', exact: true }).click()
  await expect.poll(async () => (await (await context.request.get('/api/account/preferences')).json()).preferredLocale).toBe('ru')
  const session = (await context.cookies()).find(cookie => cookie.name === 'gurach_session')!
  const other = await browser.newContext({ baseURL: origin })
  try {
    await other.addCookies([session])
    const remote = await other.newPage()
    await remote.goto('/tracks')
    await expect(remote.locator('html')).toHaveAttribute('lang', 'ru')
    await expect(remote.getByRole('heading', { name: 'Список треков', exact: true })).toBeVisible()
    await page.route('**/api/account/preferences', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, json: {} }) : route.continue())
    await page.getByRole('button', { name: 'English', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('.MuiAlert-root[role=alert]:visible')).toContainText('could not be saved to your account')
    expect((await context.cookies()).find(cookie => cookie.name === 'NEXT_LOCALE')?.value).toBe('en')
    await page.unroute('**/api/account/preferences')
    await page.locator('.MuiAlert-root[role=alert]:visible').getByRole('button', { name: 'Try again' }).click()
    await expect.poll(async () => (await (await context.request.get('/api/account/preferences')).json()).preferredLocale).toBe('en')
    await expect(page.locator('.MuiAlert-root[role=alert]:visible')).toHaveCount(0)
  } finally {
    // Keep the existing RU smoke scenarios independent of this account change.
    await context.request.put('/api/account/preferences', { headers, data: { preferredLocale: 'ru' } })
    await other.close()
  }
})

test('localizes file controls and existing validation without clearing selected files', async ({ page, context }) => {
  await context.addCookies([{ name: 'gurach_session', value: 'a'.repeat(43), domain: '127.0.0.1', path: '/', httpOnly: true }])
  await context.request.put('/api/account/preferences', { headers, data: { preferredLocale: 'en' } })
  await page.goto('/upload')
  const audio = page.getByLabel('Audio file', { exact: false })
  await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toHaveCount(2)
  await audio.setInputFiles({ name: 'original.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') })
  await expect(page.getByText('Supported formats:', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Русский', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Выбрать файл', exact: true })).toHaveCount(2)
  await expect(page.getByText('Поддерживаются форматы:', { exact: false })).toBeVisible()
  const translatedAudio = page.getByLabel('Аудиофайл')
  await expect.poll(() => translatedAudio.evaluate((node: HTMLInputElement) => node.validationMessage)).toContain('Поддерживаются форматы:')
  expect(await translatedAudio.evaluate((node: HTMLInputElement) => node.files?.[0]?.name)).toBe('original.exe')
})
