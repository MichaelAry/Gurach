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

const catalogPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64')
const catalogRelease = '20000000-0000-4000-8000-000000000002'
const showCatalog = async (page: Page) => {
  await page.getByLabel('Аудиофайл').setInputFiles({ name: 'northbound.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('track') })
  await page.getByLabel('Название трека').fill('Northbound')
  await page.getByLabel('Исполнитель', { exact: true }).fill('Catalog Artist')
  await expect(page.getByText('Выберите запись и релиз')).toBeVisible()
}

async function applyDeluxe(page: Page) {
  await page.getByRole('button', { name: /Deluxe Release/ }).click()
  await expect(page.getByRole('checkbox', { name: 'Обложка', exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Применить выбранные поля' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Применено к черновику' })).toBeVisible()
}

test('chooses a release, publishes archive bytes and edited metadata, then patches from the account editor', async ({ page }) => {
  await showCatalog(page)
  await page.getByRole('button', { name: /Original Release/ }).click()
  await expect(page.getByText('У этого издания нет обложки.')).toBeVisible()
  const archive = page.waitForResponse((response) => response.url().endsWith(`/api/metadata/artwork/${catalogRelease}`))
  await applyDeluxe(page)
  expect(await (await archive).body()).toEqual(catalogPng)
  await expect(page.getByText(/Ambient · MusicBrainz · Жанр записи/)).toBeVisible()
  await expect(page.locator('input[name=picture]')).toHaveValue('')
  await page.getByLabel('Альбом', { exact: true }).fill('Corrected album')
  await page.getByRole('textbox', { name: 'Жанры', exact: true }).fill('Ambient\nMy genre')
  await page.getByRole('checkbox', { name: 'Подобрать метаданные' }).uncheck()
  await expect(page.getByLabel('Альбом', { exact: true })).toHaveValue('Corrected album')
  await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
  await expect(page).toHaveURL(/\/tracks\/[0-9a-f]{24}$/, { timeout: 15_000 })
  const trackUrl = page.url()
  await page.reload()
  await expect(page.getByRole('main').getByText('Альбом · Corrected album')).toBeVisible()
  await expect(page.getByRole('main').getByText('Жанры · Ambient · My genre')).toBeVisible()
  const id = trackUrl.split('/').at(-1)!
  const track = await (await page.request.get(`/api/tracks/${id}`)).json()
  expect(track.provenance.genreEvidence.map(({ genre }: { genre: string }) => genre)).toEqual(['Ambient'])
  expect(track.provenance).toMatchObject({ albumSource: 'manual', pictureSource: 'cover-art-archive' })
  expect(await (await page.request.get(track.picture)).body()).toEqual(catalogPng)

  await page.goto('/account')
  await page.getByRole('button', { name: /Редактировать.*Northbound|Изменить.*Northbound/ }).click()
  const editor = page.getByRole('dialog')
  await expect(editor.getByLabel('Альбом')).toHaveValue('Corrected album')
  await editor.getByLabel('Альбом').fill('')
  await editor.getByLabel('Жанры').fill('Only manual')
  const patch = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().endsWith(`/api/tracks/${id}`))
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
  const updated = await patch
  expect(updated.request().postDataJSON()).toEqual({ album: '', genres: ['Only manual'] })
  expect(await updated.json()).toMatchObject({ album: null, genres: ['Only manual'] })
  await expect(editor).toHaveCount(0)
  await page.goto(trackUrl)
  await expect(page.getByRole('main').getByText('Жанры · Only manual').filter({ visible: true })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('main').getByText('Альбом · Corrected album')).toHaveCount(0)
})

test('keeps an applied cover when choosing another proposal, prefers a manual replacement, and allows empty optional fields', async ({ page }) => {
  await showCatalog(page)
  await applyDeluxe(page)
  await page.getByRole('button', { name: /Original Release/ }).click()
  await expect(page.getByText('У этого издания нет обложки.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Предпросмотр обложки' })).toBeVisible()
  await page.locator('input[name=picture]').setInputFiles({ name: 'mine.png', mimeType: 'image/png', buffer: catalogPng })
  await page.getByRole('button', { name: 'Удалить обложку' }).click()
  await expect(page.getByText(`cover-${catalogRelease}.png`, { exact: true })).toBeVisible()
  const replacement = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMoKT1ZUnqSAUIBAC4yBsnhu5lHAAAAAElFTkSuQmCC', 'base64')
  await page.locator('input[name=picture]').setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: replacement })
  await page.getByLabel('Альбом', { exact: true }).fill('')
  await page.getByRole('textbox', { name: 'Жанры', exact: true }).fill('')
  await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
  await expect(page).toHaveURL(/\/tracks\/[0-9a-f]{24}$/, { timeout: 15_000 })
  const id = page.url().split('/').at(-1)!
  const track = await (await page.request.get(`/api/tracks/${id}`)).json()
  expect(track).toMatchObject({ album: null, genres: [], provenance: { pictureSource: 'manual' } })
  expect(await (await page.request.get(track.picture)).body()).toEqual(replacement)
})

test('ignores a late search and makes zero catalog requests when disabled while uploading manually', async ({ page }) => {
  let releaseSearch!: () => void
  const hold = new Promise<void>((resolve) => { releaseSearch = resolve })
  let releasePaused!: () => void
  const paused = new Promise<void>((resolve) => { releasePaused = resolve })
  let requests = 0
  await page.route('**/api/metadata/search', async (route) => {
    requests++
    if (route.request().postDataJSON().name === 'Old') {
      await hold
      await route.fulfill({ json: { candidates: [{ name: 'Outdated candidate', recordingMbid: 'old' }], recommendedIndex: null } }).catch(() => {})
    } else if (route.request().postDataJSON().name === 'Paused') {
      await paused
      await route.continue().catch(() => {})
    } else await route.continue()
  })
  await page.getByLabel('Исполнитель', { exact: true }).fill('Catalog Artist')
  await page.getByLabel('Название трека').fill('Old')
  await expect.poll(() => requests).toBe(1)
  await page.getByLabel('Название трека').fill('Northbound')
  await expect(page.getByText('Выберите запись и релиз')).toBeVisible()
  releaseSearch()
  await expect(page.getByRole('button', { name: /Deluxe Release/ })).toBeVisible()
  await expect(page.getByText('Outdated candidate')).toHaveCount(0)

  await page.getByLabel('Название трека').fill('Paused')
  await expect.poll(() => requests).toBe(3)
  await page.getByRole('checkbox', { name: 'Подобрать метаданные' }).uncheck()
  releasePaused()
  await fillForm(page)
  await expect(page.getByRole('button', { name: /Deluxe Release/ })).toHaveCount(0)
  await page.waitForTimeout(850)
  expect(requests).toBe(3)
  await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
  await expect(page).toHaveURL(/\/tracks\/[0-9a-f]{24}$/, { timeout: 15_000 })
  expect(requests).toBe(3)
})

test('queries only selected catalogs and keeps successful results when another catalog fails', async ({ page }) => {
  const calls: string[] = []
  const candidate = { catalogId: '1234', sources: ['theaudiodb'], name: 'Northbound', artist: 'Catalog Artist',
    album: 'Source Album', releaseMbid: null, year: null, edition: null, version: null, durationMs: null, confidence: 0 }
  await page.route('**/api/metadata/search', async route => {
    const { source } = route.request().postDataJSON()
    calls.push(source)
    if (source === 'discogs') return route.fulfill({ status: 429 })
    await route.fulfill({ json: { candidates: [candidate], recommendedIndex: null } })
  })
  await page.route('**/api/metadata/details', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ source: 'theaudiodb', catalogId: '1234' })
    await route.fulfill({ json: { ...candidate, artworkUrl: null, genreEvidence: [] } })
  })
  await page.getByRole('checkbox', { name: 'MusicBrainz', exact: true }).uncheck()
  await fillForm(page)
  await page.waitForTimeout(850)
  expect(calls).toEqual([])
  await page.getByRole('checkbox', { name: 'TheAudioDB', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Discogs', exact: true }).check()
  await page.getByRole('button', { name: /Source Album/ }).click()
  await page.getByRole('button', { name: 'Применить выбранные поля' }).click()
  await expect(page.getByLabel('Альбом', { exact: true })).toHaveValue('Source Album')
  expect(calls.sort()).toEqual(['discogs', 'theaudiodb'])
  await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
  await expect(page).toHaveURL(/\/tracks\/[0-9a-f]{24}$/, { timeout: 15_000 })
  const track = await (await page.request.get('/api/tracks/' + page.url().split('/').at(-1))).json()
  expect(track).toMatchObject({ album: 'Source Album', externalIds: { audioDbTrackId: '1234' }, provenance: { albumSource: 'theaudiodb' } })
})

test('publishes album and genres selected from different catalogs', async ({ page }) => {
  const identity = { name: 'Мой трек', artist: 'Исполнитель', releaseMbid: null, year: null,
    edition: null, version: null, durationMs: null, confidence: 1 }
  const album = { ...identity, catalogId: '41', sources: ['theaudiodb'], album: 'AudioDB Album', genreEvidence: [] }
  const genres = { ...identity, catalogId: '42', sources: ['discogs'], album: 'Discogs Album',
    genreEvidence: [{ genre: 'Indie Rock', rawTag: 'Indie Rock', source: 'discogs', scope: 'release', confidence: 1 }] }
  const resultFor = (source: string) => source === 'discogs' ? genres : album
  await page.route('**/api/metadata/search', route => route.fulfill({
    json: { candidates: [resultFor(route.request().postDataJSON().source)], recommendedIndex: null },
  }))
  await page.route('**/api/metadata/details', route => route.fulfill({
    json: { ...resultFor(route.request().postDataJSON().source), artworkUrl: null },
  }))
  await page.getByRole('checkbox', { name: 'MusicBrainz', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: 'TheAudioDB', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Discogs', exact: true }).check()
  await fillForm(page)
  const audioDb = page.getByRole('group', { name: 'TheAudioDB', exact: true })
  const discogs = page.getByRole('group', { name: 'Discogs', exact: true })
  await audioDb.getByRole('button', { name: /AudioDB Album/ }).click()
  await audioDb.getByRole('button', { name: 'Применить выбранные поля' }).click()
  await discogs.getByRole('button', { name: /Discogs Album/ }).click()
  await discogs.getByRole('checkbox', { name: /Discogs Album/ }).uncheck()
  await discogs.getByRole('button', { name: 'Применить выбранные поля' }).click()
  await expect(page.getByLabel('Альбом', { exact: true })).toHaveValue('AudioDB Album')
  await page.getByRole('button', { name: 'Загрузить трек', exact: true }).click()
  await expect(page).toHaveURL(/\/tracks\/[0-9a-f]{24}$/, { timeout: 15_000 })
  const track = await (await page.request.get('/api/tracks/' + page.url().split('/').at(-1))).json()
  expect(track).toMatchObject({ album: 'AudioDB Album', genres: ['Indie Rock'],
    externalIds: { audioDbTrackId: '41', discogsReleaseId: '42' },
    provenance: { albumSource: 'theaudiodb', genreEvidence: genres.genreEvidence } })
})
