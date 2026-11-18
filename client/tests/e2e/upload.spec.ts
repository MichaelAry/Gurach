import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'gurach_session', value: 'a'.repeat(43), domain: '127.0.0.1', path: '/', httpOnly: true }])
  await page.goto('/upload')
  await expect(page.getByLabel('Аудиофайл')).toBeVisible()
})

async function fillForm(page: Page) {
  await page.getByLabel('Аудиофайл').setInputFiles({ name: 'song.MP3', mimeType: 'audio/mpeg', buffer: Buffer.from('audio') })
  await page.getByLabel('Обложка').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('cover') })
  await page.getByLabel('Название трека').fill('  Мой трек  ')
  await page.getByLabel('Исполнитель').fill('  Исполнитель  ')
  await page.getByLabel('Текст песни').fill('Текст песни')
}

test('validates local files and required fields before making a request', async ({ page }) => {
  let requests = 0
  await page.route('**/api/tracks', async (route) => { requests++; await route.fulfill({ status: 201, json: {} }) })
  await fillForm(page)
  await page.getByLabel('Аудиофайл').setInputFiles({ name: 'song.txt', mimeType: 'text/plain', buffer: Buffer.from('text') })
  await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
  await expect(page.getByText('Поддерживаются форматы:')).toBeVisible()
  expect(requests).toBe(0)
  await page.getByLabel('Аудиофайл').setInputFiles({ name: 'empty.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(0) })
  await expect(page.getByText('Файл пуст. Выберите другой файл.')).toBeVisible()
  await fillForm(page)
  await page.getByLabel('Обложка').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) })
  await expect(page.getByText('Размер файла не должен превышать 10 МиБ.')).toBeVisible()
  await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
  expect(requests).toBe(0)
  await fillForm(page)
  await page.getByLabel('Название трека').fill('   ')
  await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
  expect(requests).toBe(0)
})

test('locks the form during upload, prevents duplicates and opens the published track', async ({ page }) => {
  let requests = 0
  let release!: () => void
  const waiting = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/tracks', async (route) => {
    requests++
    expect(route.request().headers()['x-gurach-request']).toBe('1')
    const body = route.request().postData()!
    expect(body).toContain('name="name"\r\n\r\nМой трек\r\n')
    expect(body).toContain('filename="song.MP3"')
    expect(body).toContain('filename="cover.png"')
    await waiting
    await route.fulfill({ status: 201, json: { _id: '000000000000000000000001' } })
  })
  await fillForm(page)
  try {
    await page.locator('form').evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit() })
    await expect.poll(() => requests).toBe(1)
    await expect(page.getByRole('button', { name: 'Загружаем…' })).toBeDisabled()
    await expect(page.getByLabel('Название трека')).toBeDisabled()
    await expect(page.getByRole('progressbar', { name: 'Загрузка трека' })).toBeVisible()
    await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
    await expect(page.getByRole('status')).toHaveText('Отправляем файлы на сервер…')
    await expect(page.getByText('Оставьте страницу открытой', { exact: false })).toBeVisible()
  } finally { release() }
  await expect(page).toHaveURL(/\/tracks\/000000000000000000000001$/)
  await expect(page.getByRole('heading', { name: 'Track 1', exact: true })).toBeVisible()
  expect(requests).toBe(1)
})

test('previews and replaces the cover, releases blob URLs and displays audio size', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64')
  const cover = page.getByLabel('Обложка')
  await cover.setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: png })
  const preview = page.getByRole('img', { name: 'Предпросмотр обложки' })
  await expect(preview).toBeVisible()
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  expect(await preview.boundingBox()).toMatchObject({ width: 160, height: 160 })
  const firstURL = (await preview.getAttribute('src'))!
  await cover.setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: png })
  await expect(preview).not.toHaveAttribute('src', firstURL)
  const canRead = (url: string) => page.evaluate((src) => fetch(src).then(() => true, () => false), url)
  await expect.poll(() => canRead(firstURL)).toBe(false)
  const secondURL = (await preview.getAttribute('src'))!
  await cover.setInputFiles([])
  await expect(preview).toHaveCount(0)
  await expect.poll(() => canRead(secondURL)).toBe(false)

  await page.getByLabel('Аудиофайл').setInputFiles({ name: 'audio.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(1024 * 1024) })
  await expect(page.getByText('Размер аудио: 1 МиБ', { exact: true })).toBeVisible()
  await page.getByLabel('Аудиофайл').setInputFiles([])
  await expect(page.getByText('Размер аудио:', { exact: false })).toHaveCount(0)
  await cover.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken') })
  await expect(page.getByText('Не удалось показать обложку.', { exact: false })).toBeVisible()
  await cover.setInputFiles({ name: 'valid.png', mimeType: 'image/png', buffer: png })
  await expect(preview).toBeVisible()
  await expect(page.getByText('Не удалось показать обложку.', { exact: false })).toHaveCount(0)
  const finalURL = (await preview.getAttribute('src'))!
  // Client navigation unmounts the form but keeps the document's blob registry.
  await page.locator('a[href="/tracks"]').filter({ visible: true }).first().click()
  await expect(page).toHaveURL(/\/tracks$/)
  await expect.poll(() => canRead(finalURL)).toBe(false)
})

test('restores accepted background processing after leaving without sending files again', async ({ page }) => {
  const operationId = '10000000-0000-4000-8000-000000000001'
  let posts = 0
  let polls = 0
  let published = false
  await page.route('**/api/tracks', async (route) => {
    posts++
    await route.fulfill({ status: 202, json: { operationId, status: 'queued' } })
  })
  await page.route(`**/api/tracks/uploads/${operationId}`, async (route) => {
    polls++
    await route.fulfill({ json: { operationId, trackId: '000000000000000000000001', status: published ? 'published' : 'processing' } })
  })
  await fillForm(page)
  await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Файлы приняты. Подготавливаем трек…')
  await expect(page.getByText('Можно уйти со страницы:', { exact: false })).toBeVisible()
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  await expect.poll(() => polls).toBeGreaterThan(0)
  await page.goto('/tracks')
  const beforeReturn = polls
  await page.goto('/upload')
  await expect(page.getByRole('status')).toHaveText('Файлы приняты. Подготавливаем трек…')
  await expect.poll(() => polls).toBeGreaterThan(beforeReturn)
  await expect(page.getByLabel('Аудиофайл')).toHaveValue('')
  expect(posts).toBe(1)
  published = true
  await expect(page).toHaveURL(/\/tracks\/000000000000000000000001$/)
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('gurach-upload:')))).toEqual([])
  expect(posts).toBe(1)
})

test('rechecks an accepted job after a polling error and resets the stage on terminal failure', async ({ page }) => {
  const operationId = '20000000-0000-4000-8000-000000000001'
  let posts = 0
  let polls = 0
  await page.route('**/api/tracks', async (route) => {
    posts++
    await route.fulfill({ status: 202, json: { operationId, status: 'queued' } })
  })
  await page.route(`**/api/tracks/uploads/${operationId}`, async (route) => {
    polls++
    await route.fulfill(polls === 1 ? { status: 503, json: {} }
      : { json: { operationId, status: 'failed', errorCode: 'media_failed' } })
  })
  await fillForm(page)
  await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось получить состояние' })).toBeVisible()
  await expect(page.getByText('Можно уйти со страницы:', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Проверить обработку', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Обработка завершилась ошибкой' })).toBeVisible()
  await expect(page.getByText('Можно уйти со страницы:', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Загрузить трек', exact: true })).toBeEnabled()
  expect(posts).toBe(1)
  expect(polls).toBe(2)
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('gurach-upload:')))).toEqual([])
})

test('keeps selected files and text on failure and supports a manual retry', async ({ page }) => {
  let requests = 0
  await page.route('**/api/tracks', async (route) => {
    requests++
    await route.fulfill({ status: requests === 1 ? 429 : 201, json: { _id: '000000000000000000000001' } })
  })
  await fillForm(page)
  await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Подождите минуту' })).toBeVisible()
  await expect(page.getByLabel('Название трека')).toHaveValue('  Мой трек  ')
  await expect(page.getByLabel('Аудиофайл')).toHaveValue(/song.MP3$/)
  await expect(page.getByRole('button', { name: 'Загрузить трек', exact: true })).toBeEnabled()
  expect(requests).toBe(1)
  await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
  await expect(page).toHaveURL(/\/tracks\/000000000000000000000001$/)
  expect(requests).toBe(2)
})

test('publishes through the proxy and exposes the track to another account', async ({ page, browser }) => {
  const other = await browser.newContext()
  try {
    await other.addCookies([{ name: 'gurach_session', value: 'b'.repeat(43), domain: '127.0.0.1', path: '/', httpOnly: true }])
    const reader = await other.newPage()
    // Prime the shared catalogue cache before publication.
    await reader.goto('http://127.0.0.1:3200/tracks')
    await expect(reader.getByRole('link', { name: 'Track 1', exact: true })).toBeVisible()
    await fillForm(page)
    const name = `Общий трек ${Date.now()}`
    await page.getByLabel('Название трека').fill(name)
    const published = page.waitForResponse((response) => response.url().endsWith('/api/tracks') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
    const response = await published
    expect(response.status()).toBe(202)
    const job = await response.json()
    expect(job.status).toBe('queued')
    const track = { _id: job.trackId }
    await expect(page).toHaveURL(new RegExp(`/tracks/${track._id}$`))
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
    await reader.reload()
    await expect(reader.getByRole('link', { name: 'Track 1', exact: true })).toBeVisible()
    const row = reader.getByRole('link', { name, exact: true })
    while (!(await row.count()) && await reader.getByRole('button', { name: 'Загрузить ещё', exact: true }).count()) {
      const more = reader.getByRole('button', { name: 'Загрузить ещё', exact: true })
      await more.click()
      await expect(reader.getByRole('button', { name: 'Загружаем…', exact: true })).toHaveCount(0)
    }
    await expect(row).toBeVisible()
    await reader.goto(`http://127.0.0.1:3200/tracks/${track._id}`)
    await expect(reader.getByRole('heading', { name, exact: true })).toBeVisible()
    await reader.getByText('Лирика', { exact: true }).click()
    await expect(reader.getByText('Текст песни', { exact: true })).toBeVisible()
  } finally { await other.close() }
})
