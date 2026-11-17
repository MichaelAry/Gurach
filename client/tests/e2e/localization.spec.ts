import { expect, test, type Page, type Request } from '@playwright/test'

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

test('server renders localized headings and metadata without JavaScript', async ({ browser }) => {
  for (const [locale, heading, title, description] of [
    ['en', 'Track list', 'Tracks', 'Browse and search tracks by title or artist'],
    ['ru', 'Список треков', 'Треки', 'Каталог и поиск треков по названию или исполнителю'],
  ]) {
    const context = await browser.newContext({ javaScriptEnabled: false })
    try {
      await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, domain: '127.0.0.1', path: '/' }])
      const page = await context.newPage()
      await page.goto(`${origin}/tracks`)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await expect(page).toHaveTitle(title)
      await expect(page.locator('head meta[name="description"]')).toHaveAttribute('content', description)
    } finally {
      await context.close()
    }
  }
})

test('defaults to English, switches all text without a route refresh and persists Russian across reloads', async ({ page, context }) => {
  await page.goto('/tracks?query=Track')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { name: 'Track list', exact: true })).toBeVisible()
  await expect(page.getByLabel('Search by title or artist')).toHaveValue('Track')
  const refreshes: string[] = []
  const recordRefresh = (request: Request) => {
    if (request.headers().rsc === '1' && !request.headers()['next-router-prefetch']) refreshes.push(request.url())
  }
  page.on('request', recordRefresh)
  await page.getByRole('button', { name: 'Русский', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Список треков', exact: true })).toBeVisible()
  await expect(page.getByLabel('Поиск по названию или исполнителю')).toHaveValue('Track')
  await expect(page).toHaveURL(/query=Track/)
  await expect(page).toHaveTitle('Треки')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Каталог и поиск треков по названию или исполнителю')
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Треки')
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', 'Треки')
  await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute('content', 'Музыкальный плеер')
  expect(refreshes).toEqual([])
  page.off('request', recordRefresh)
  expect((await context.cookies()).find(cookie => cookie.name === 'NEXT_LOCALE')?.value).toBe('ru')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await expect(page.getByRole('heading', { name: 'Список треков', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Track list', exact: true })).toBeVisible()
  await expect(page).toHaveTitle('Tracks')
  await expect(page.locator('head title')).toHaveCount(1)
  await expect(page.locator('head meta[name="description"]')).toHaveCount(1)
  await expect(page.locator('head meta[property="og:description"]')).toHaveAttribute('content', 'Music player')
  await expect(page.locator('body')).not.toContainText('~i18n:')
})

test('switches track details and missing-track text locally while offline', async ({ page, context }) => {
  for (const missing of [false, true]) {
    await context.clearCookies()
    await page.goto(missing ? '/tracks/ffffffffffffffffffffffff' : '/tracks/000000000000000000000001')
    await expect(page.getByRole('heading', { name: missing ? 'Track not found' : 'Track 1', exact: true })).toBeVisible()
    const refreshes: string[] = []
    const recordRefresh = (request: Request) => {
      if (request.headers().rsc === '1') refreshes.push(request.url())
    }
    page.on('request', recordRefresh)
    await context.setOffline(true)
    try {
      await page.getByRole('button', { name: 'Русский', exact: true }).click()
      if (missing) {
        await expect(page.getByRole('heading', { name: 'Трек не найден', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'К списку треков', exact: true })).toBeVisible()
        await expect(page).toHaveTitle('Трек не найден')
      } else {
        await expect(page.getByRole('heading', { name: 'Лирика', exact: true })).toBeVisible()
        await expect(page.getByText('Лирика недоступна', { exact: true })).toBeVisible()
        await expect(page).toHaveTitle('Track 1 — Artist 1')
      }
      expect(refreshes).toEqual([])
    } finally {
      page.off('request', recordRefresh)
      await context.setOffline(false)
    }
  }
})

test('keeps metadata localized when navigating between pages after a language change', async ({ page }) => {
  await page.goto('/tracks')
  await page.getByRole('button', { name: 'Русский', exact: true }).click()
  await expect(page).toHaveTitle('Треки')
  await page.getByRole('navigation').getByRole('link', { name: 'Избранное', exact: true }).click()
  await expect(page).toHaveURL(/\/favorites$/)
  await expect(page).toHaveTitle('Избранные треки')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page).toHaveTitle('Favorite tracks')
  await page.getByRole('navigation').getByRole('link', { name: 'All tracks', exact: true }).click()
  await expect(page).toHaveURL(/\/tracks$/)
  await expect(page).toHaveTitle('Tracks')
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

test('saves an account preference, restores it in a new browser and silently keeps local selection when saving fails', async ({ page, context, browser }) => {
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
    const failedSave = page.waitForResponse(response => response.url().endsWith('/api/account/preferences') && response.request().method() === 'PUT' && response.status() === 503)
    await page.getByRole('button', { name: 'English', exact: true }).click()
    await failedSave
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('.MuiAlert-root[role=alert]:visible')).toHaveCount(0)
    expect((await context.cookies()).find(cookie => cookie.name === 'NEXT_LOCALE')?.value).toBe('en')
    await page.getByRole('link', { name: 'My account', exact: true }).click()
    const languageSettings = page.locator('section').filter({ has: page.getByRole('heading', { name: /^(Language|Язык)$/ }) })
    await expect(languageSettings).toBeVisible()
    await expect(languageSettings.getByRole('button', { name: 'English', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(languageSettings).not.toContainText('Your language is saved')
    await expect(languageSettings.getByRole('alert')).toHaveCount(0)
    await page.unroute('**/api/account/preferences')
    const savedRussian = page.waitForResponse(response => response.url().endsWith('/api/account/preferences') && response.request().method() === 'PUT' && response.ok())
    await page.getByRole('button', { name: 'Русский', exact: true }).first().click()
    await savedRussian
    await expect(languageSettings.getByRole('button', { name: 'Русский', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await (await context.request.get('/api/account/preferences')).json()).preferredLocale).toBe('ru')
    await page.getByRole('button', { name: 'English', exact: true }).first().click()
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
