import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page) {
  await page.goto('/login?returnTo=/tracks')
  await page.getByLabel('Имя пользователя').fill('fixture_user')
  await page.getByLabel('Пароль').fill('fixture password long')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/\/tracks$/)
}

test('keeps the same playing audio and position when opening, collapsing and using browser history', async ({ page }) => {
  await signIn(page)
  const audio = page.locator('audio')
  await page.getByRole('main').getByRole('button', { name: 'Играть Track 1', exact: true }).click()
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.readyState >= 2 && !node.paused)).toBe(true)
  const originalAudio = await audio.elementHandle()
  await audio.evaluate((node: HTMLAudioElement) => {
    node.currentTime = 5
    node.playbackRate = 0.25
    node.dataset.loads = '0'
    node.addEventListener('loadstart', () => { node.dataset.loads = String(Number(node.dataset.loads) + 1) })
  })
  // Keep the click above the Next.js development indicator in the lower-left corner.
  await page.getByRole('button', { name: 'Развернуть плеер с обложки' }).click({ position: { x: 48, y: 8 } })
  await expect(page).toHaveURL(/\/player\?returnTo=/)
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Track 1', exact: true })).toBeVisible()
  await expect(page.locator('[data-waveform="ready"]')).toBeVisible()
  await expect(page.locator('main [data-playing]')).toHaveAttribute('data-playing', 'true')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.getByRole('main').evaluate(node => [...node.querySelectorAll('.fullscreen-player-recordLabel, .fullscreen-player-glow')].map(element => getComputedStyle(element).animationName))).toEqual(['none', 'none'])
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(audio).toHaveCount(1)
  expect(await originalAudio!.evaluate((node) => node === document.querySelector('audio'))).toBe(true)
  expect(await audio.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThanOrEqual(5)
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Пауза', exact: true }).click()
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(true)
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).focus()
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).press('ArrowRight')
  await page.getByRole('button', { name: 'Играть', exact: true }).click()
  await page.getByRole('link', { name: 'Свернуть плеер' }).click()
  await expect(page).toHaveURL(/\/tracks$/)
  await expect(page.getByRole('contentinfo').getByText('1 / 3', { exact: true })).toBeVisible()
  expect(await originalAudio!.evaluate((node) => node === document.querySelector('audio'))).toBe(true)
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => !node.paused)).toBe(true)
  await expect(audio).toHaveAttribute('data-loads', '0')

  await page.getByRole('button', { name: 'Открыть полноэкранный плеер' }).click()
  await expect(page).toHaveURL(/\/player\?returnTo=/)
  await page.goBack()
  await expect(page.getByRole('contentinfo')).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('link', { name: 'Свернуть плеер' })).toBeVisible()
  expect(await originalAudio!.evaluate((node) => node === document.querySelector('audio'))).toBe(true)
  await expect(audio).toHaveAttribute('data-loads', '0')
})

test('shares account transport, queue and favorites with the compact player', async ({ page }) => {
  await signIn(page)
  await page.getByRole('main').getByRole('button', { name: 'Играть Track 1', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть полноэкранный плеер' }).click()
  await expect(page.getByRole('heading', { name: 'Track 1', exact: true })).toBeVisible()
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
  await page.getByRole('button', { name: 'Добавить в избранное: Track 1', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Убрать из избранного: Track 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Перемешать порядок воспроизведения' }).click()
  await expect(page.getByRole('button', { name: 'Перемешать порядок воспроизведения' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /Переключить режим повтора/ }).click()
  await page.getByRole('heading', { name: 'Track 1', exact: true }).hover()
  for (const label of [/Убрать из избранного: Track 1/, /Перемешать порядок воспроизведения/, /Переключить режим повтора/]) {
    await expect(page.getByRole('button', { name: label })).toHaveCSS('background-color', 'rgb(199, 189, 177)')
  }
  const volume = page.getByRole('slider', { name: 'Громкость', exact: true })
  await volume.press('End')
  await expect(page.locator('main [data-volume-lit]')).toHaveCount(14)
  await volume.press('Home')
  await volume.press('ArrowRight')
  await expect(volume).toHaveAttribute('aria-valuetext', '1%')
  await page.getByRole('button', { name: 'Без звука', exact: true }).click()
  await expect.poll(() => page.locator('audio').evaluate((node: HTMLAudioElement) => node.muted && Math.round(node.volume * 100) === 1)).toBe(true)
  await page.getByRole('button', { name: /Открыть очередь/ }).first().click()
  const queue = page.getByRole('region', { name: 'Очередь воспроизведения' })
  await queue.getByRole('button', { name: 'Играть: 3. Track 2 — Artist 2', exact: true }).click()
  await queue.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Track 2', exact: true })).toBeVisible()
  await expect(page.locator('audio')).toHaveAttribute('src', /track-2\.mp3$/)
  await page.getByRole('link', { name: 'Свернуть плеер' }).click()
  const footer = page.getByRole('contentinfo')
  await expect(footer.getByText('3 / 3', { exact: true })).toBeVisible()
  await expect(footer.getByRole('button', { name: 'Перемешать порядок воспроизведения' })).toHaveAttribute('aria-pressed', 'true')
  await expect(footer.getByRole('button', { name: /Переключить режим повтора/ })).toHaveAttribute('aria-pressed', 'true')
  for (const label of [/Перемешать порядок воспроизведения/, /Переключить режим повтора/, /^Без звука$/]) {
    await expect(footer.getByRole('button', { name: label })).toHaveCSS('background-color', 'rgb(199, 189, 177)')
  }
  await expect(footer.getByRole('slider', { name: 'Громкость', exact: true })).toHaveAttribute('aria-valuenow', '1')
})

test('opens directly with an empty queue, fits mobile and returns to the catalogue', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/player')
  await expect(page.getByRole('heading', { name: 'Выберите трек', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Играть', exact: true })).toBeDisabled()
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
  await expect(page.getByRole('navigation')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const play = await page.getByRole('button', { name: 'Играть', exact: true }).boundingBox()
  expect(play!.y + play!.height).toBeLessThan(812)
  await page.getByRole('button', { name: /Открыть очередь/ }).first().focus()
  await page.keyboard.press('Enter')
  const queue = page.getByRole('region', { name: 'Очередь воспроизведения' })
  await queue.getByRole('button', { name: 'Очистить', exact: true }).click()
  await page.getByRole('dialog', { name: 'Очистить очередь?' }).getByRole('button', { name: 'Очистить', exact: true }).click()
  await page.getByRole('button', { name: /Открыть очередь/ }).first().click()
  await expect(queue.getByText('Очередь пуста. Добавьте треки из каталога.')).toBeVisible()
  await queue.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.getByRole('link', { name: 'Свернуть плеер' }).click()
  await expect(page).toHaveURL(/\/tracks$/)

  await page.getByRole('button', { name: 'Играть Track 1', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть полноэкранный плеер' }).click()
  await expect(page.getByRole('heading', { name: 'Track 1', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Track 1', exact: true })).toBeVisible()
  await expect.poll(() => page.locator('audio').evaluate((node: HTMLAudioElement) => node.paused)).toBe(true)
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByRole('link', { name: 'Свернуть плеер' })).toBeVisible()
  await page.screenshot({ path: '/tmp/gurach-player-mobile.png', fullPage: true })
})

test('restores the catalogue search after closing the player and shows retry after an audio error', async ({ page }) => {
  const catalogueUrl = '/tracks?query=Track%201'
  const search = page.getByRole('searchbox', { name: 'Поиск по названию или исполнителю' })
  const catalogue = page.getByRole('main')
  await page.goto(catalogueUrl)
  await expect(search).toHaveValue('Track 1')
  await page.getByRole('button', { name: 'Играть Track 1', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть полноэкранный плеер' }).click()
  await page.locator('audio').evaluate((node) => node.dispatchEvent(new Event('error')))
  await expect(page.getByRole('button', { name: 'Повторить аудио', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Повторить аудио', exact: true }).click()
  await expect.poll(() => page.locator('audio').evaluate((node: HTMLAudioElement) => !node.paused)).toBe(true)
  await page.screenshot({ path: '/tmp/gurach-player-desktop.png', fullPage: true })
  await page.getByRole('link', { name: 'Свернуть плеер' }).click()
  await expect(page).toHaveURL(catalogueUrl)
  await expect(search).toHaveValue('Track 1')
  await expect(catalogue.getByRole('link', { name: 'Track 1', exact: true })).toBeVisible()
  await expect(catalogue.getByRole('link', { name: 'Track 2', exact: true })).toHaveCount(0)
})


test('keeps seeking and playback available when waveform decoding fails', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'OfflineAudioContext', { configurable: true, value: class {
      decodeAudioData() {
        document.documentElement.dataset.waveformFailed = 'true'
        return Promise.reject(new Error('Unsupported decoder'))
      }
    } })
  })
  await page.goto('/tracks')
  await page.getByRole('button', { name: 'Играть Track 1', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть полноэкранный плеер' }).click()
  await expect(page.getByRole('heading', { name: 'Track 1', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-waveform-failed', 'true')
  await expect(page.locator('[data-waveform="fallback"]')).toBeVisible()
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeEnabled()
  await expect.poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true)
})


test('uses the real artwork and keeps long titles readable at narrow widths', async ({ page }) => {
  const name = 'Длинное название трека ' + 'безпробелов'.repeat(14)
  const picture = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#986049"/></svg>')
  await page.route('**/api/queue', async route => {
    if (route.request().method() !== 'GET') return route.continue()
    const response = await route.fetch()
    const body = await response.json()
    if (body.entries?.[0]?.track) Object.assign(body.entries[0].track, { name, picture })
    await route.fulfill({ response, json: body })
  })
  await signIn(page)
  await page.getByRole('main').getByRole('button', { name: 'Играть Track 1', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть полноэкранный плеер' }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name, exact: true })).toHaveAttribute('src', picture)
  for (const width of [1280, 900, 600, 375, 320]) {
    await page.setViewportSize({ width, height: 812 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('applies the current cover to vinyl, controls and queue across viewport sizes', async ({ page }) => {
  let releaseCool!: () => void
  const coolResponse = new Promise<void>(resolve => { releaseCool = resolve })
  const colors = [['#b84e32', '#f5d7a4', '#26528c'], ['#182742', '#556476', '#8191a4', '#e9913c']]
  await page.route('**/api/queue', async route => {
    if (route.request().method() !== 'GET') return route.continue()
    const response = await route.fetch()
    const body = await response.json()
    for (const [index, entry] of (body.entries ?? []).entries()) {
      if (entry.track?.name === 'Track 1') entry.track.picture = index === 0 ? '/theme-cover-0.svg' : '/theme-cover-broken.svg'
      if (entry.track?.name === 'Track 2') entry.track.picture = '/theme-cover-1.svg'
    }
    await route.fulfill({ response, json: body })
  })
  await page.route('**/theme-cover-*.svg', async route => {
    if (route.request().url().endsWith('broken.svg')) return route.fulfill({ status: 404 })
    const index = Number(route.request().url().match(/-(\d)\.svg$/)?.[1])
    if (index === 1) await coolResponse
    const [main, secondary, center, accent] = colors[index]
    await route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 100 100"><rect width="100" height="100" fill="${main}"/><circle cx="50" cy="50" r="34" fill="${secondary}"/><circle cx="50" cy="50" r="18" fill="${center}"/>${accent ? `<circle cx="50" cy="50" r="11" fill="${accent}"/>` : ''}</svg>` })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signIn(page)
  await page.getByRole('main').getByRole('button', { name: 'Играть Track 1', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть полноэкранный плеер' }).click()
  const player = page.locator('.fullscreen-player')
  await expect(player).toHaveAttribute('data-artwork-theme', 'cover')
  await expect(player).toHaveAttribute('data-artwork-tone', 'light')
  await expect(player.locator('.fullscreen-player-record')).toHaveCSS('background-image', /rgb\(184, 78, 50\)/)
  const play = player.locator('.fullscreen-player-transport button').filter({ has: page.locator('[data-testid="PauseRoundedIcon"]') })
  await expect(play).toHaveCSS('background-color', 'rgb(147, 62, 40)')
  await page.screenshot({ path: '/tmp/gurach-artwork-player-light.png', fullPage: true, style: 'nextjs-portal { display: none }' })
  await page.getByRole('link', { name: 'Свернуть плеер' }).focus()
  await page.keyboard.press('Tab')
  const openQueue = page.getByRole('button', { name: /Открыть очередь/ }).first()
  await expect(openQueue).toBeFocused()
  await expect(openQueue).toHaveCSS('outline-width', '2px')
  await page.keyboard.press('Enter')
  const queue = page.getByRole('region', { name: 'Очередь воспроизведения' })
  await expect(page.locator('.MuiDrawer-paper').filter({ has: queue })).toHaveCSS('background-color', 'rgb(251, 244, 243)')
  await queue.getByRole('button', { name: /Играть: .*Track 2/ }).click()
  await expect(player.locator('h2')).toHaveText('Track 2')
  await queue.getByRole('button', { name: /Играть: 2\. Track 1/ }).click()
  await expect(player).toHaveAttribute('data-artwork-theme', 'default')
  const lateCover = page.waitForResponse('**/theme-cover-1.svg')
  releaseCool()
  await lateCover
  await expect(player.locator('.fullscreen-player-record')).toHaveCSS('background-image', /rgb\(38, 40, 36\)/)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await player.evaluate(element => {
    let darkestContrast = Infinity
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    const luminance = (css: string) => {
      context.fillStyle = css
      context.fillRect(0, 0, 1, 1)
      const [red, green, blue] = Array.from(context.getImageData(0, 0, 1, 1).data, value => {
        const channel = value / 255
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
      })
      return .2126 * red + .7152 * green + .0722 * blue
    }
    const sample = () => {
      const styles = getComputedStyle(element)
      const ink = luminance(styles.color) + .05
      for (const property of ['base', 'glow', 'edge']) {
        const paper = luminance(styles.getPropertyValue(`--artwork-${property}`).trim()) + .05
        darkestContrast = Math.min(darkestContrast, Math.max(ink, paper) / Math.min(ink, paper))
      }
      element.dataset.minimumContrast = String(darkestContrast)
      if (!element.dataset.stopContrastSampling) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await queue.getByRole('button', { name: /Играть: .*Track 2/ }).click()
  await expect(player).toHaveAttribute('data-artwork-tone', 'dark')
  await queue.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(queue).toBeHidden()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(player.locator('.fullscreen-player-record')).toHaveCSS('background-image', /rgb\(24, 39, 66\)/)
  await expect(play).toHaveCSS('background-color', /rgb\(23[0-5], 14[3-7], 6[0-4]\)/)
  await page.screenshot({ path: '/tmp/gurach-artwork-player-dark.png', fullPage: true, style: 'nextjs-portal { display: none }' })
  await openQueue.click()
  await expect(page.locator('.MuiDrawer-paper').filter({ has: queue })).toHaveCSS('background-color', 'rgb(8, 14, 23)')
  await queue.getByRole('button', { name: /Играть: 1\. Track 1/ }).click()
  await expect(player).toHaveAttribute('data-artwork-tone', 'light')
  await queue.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(queue).toBeHidden()
  expect(await player.evaluate(element => {
    element.dataset.stopContrastSampling = 'true'
    return Number(element.dataset.minimumContrast)
  })).toBeGreaterThanOrEqual(4.5)
  await page.getByRole('link', { name: 'Свернуть плеер' }).click()
  await expect(page.getByRole('contentinfo')).toBeVisible()
  await expect(player).toHaveCount(0)
})
