import { expect, test } from '@playwright/test'

for (const width of [320, 390, 1440]) {
  test(`active navigation, current track and progress remain distinct at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/tracks')
    const main = page.getByRole('main'), footer = page.getByRole('contentinfo')
    const row = main.locator('.MuiCard-root').filter({ has: page.getByRole('link', { name: 'Track 1', exact: true }) })
    await main.getByRole('button', { name: 'Играть Track 1', exact: true }).click()
    await expect(row).toHaveAttribute('aria-current', 'true')
    await expect(row.getByText('Сейчас звучит', { exact: true })).toBeVisible()
    await main.getByRole('button', { name: 'Пауза Track 1', exact: true }).click()
    await expect(row.getByText('Текущий трек · пауза', { exact: true })).toBeVisible()
    const playBox = (await footer.getByRole('button', { name: 'Играть', exact: true }).boundingBox())!
    expect(Math.abs(playBox.x + playBox.width / 2 - width / 2)).toBeLessThan(1)
    for (const name of [/Перемешать порядок/, /Переключить режим повтора/]) {
      const action = footer.getByRole('button', { name })
      await expect(action).toBeVisible()
      const box = (await action.boundingBox())!
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(160)
      expect(Math.abs(box.y + box.height / 2 - (playBox.y + playBox.height / 2))).toBeLessThan(1)
    }
    const rightmostAction = width < 900 ? 'Настроить громкость' : 'Открыть полноэкранный плеер'
    const actionBox = (await footer.getByRole('button', { name: rightmostAction, exact: true }).boundingBox())!
    expect(Math.abs(actionBox.x + actionBox.width - (width - 16))).toBeLessThanOrEqual(1)
    const artworkBox = (await footer.locator('.fullscreen-player-artwork').boundingBox())!
    expect(Math.abs(artworkBox.x - 16)).toBeLessThanOrEqual(1)
    const favoriteBox = (await footer.getByRole('button', { name: /добавить в избранное/i }).boundingBox())!
    expect(artworkBox.width).toBe(width < 900 ? 56 : 64)
    const titleBox = (await footer.getByText('Track 1', { exact: true }).boundingBox())!
    expect(titleBox.x - (artworkBox.x + artworkBox.width)).toBeCloseTo(8, 0)
    expect(favoriteBox.x - (titleBox.x + titleBox.width)).toBeCloseTo(8, 0)
    expect(Math.abs(favoriteBox.y + favoriteBox.height / 2 - (artworkBox.y + artworkBox.height / 2))).toBeLessThan(1)
    await row.hover()
    await expect(row).toHaveCSS('box-shadow', 'rgb(152, 96, 73) 3px 0px 0px 0px inset')
    await expect(row.locator('[data-current-track-label] svg')).toBeVisible()
    await expect(main.getByRole('link', { name: 'Track 2', exact: true })).toBeVisible()

    const seek = footer.getByRole('slider', { name: 'Позиция воспроизведения', exact: true })
    await expect(seek).toBeEnabled()
    await seek.press('Home')
    await seek.press('ArrowRight')
    await expect.poll(() => seek.inputValue()).toBe('1')
    const track = footer.locator('.MuiSlider-track').first()
    expect((await track.boundingBox())!.width).toBeGreaterThan(0)
    await expect(footer.locator('.MuiSlider-thumb').first()).toBeVisible()
    await expect(track).toHaveCSS('color', 'rgb(152, 96, 73)')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ animations: 'disabled', path: `/tmp/gurach-imp06/catalogue-${width}.png` })

    await footer.getByRole('button', { name: /Открыть очередь/ }).click()
    const queue = page.getByRole('region', { name: 'Очередь воспроизведения' })
    await expect(page.locator('.MuiDrawer-paper').filter({ has: page.getByRole('region', { name: 'Очередь воспроизведения' }) })).toHaveCSS('transform', 'none')
    const current = queue.getByRole('listitem').filter({ has: page.locator('[data-current-track-label]') })
    await expect(current).toHaveAttribute('aria-current', 'true')
    await expect(current.getByText('Текущий трек · пауза', { exact: true })).toBeVisible()
    await expect(current.locator('[data-current-track-label] svg')).toBeVisible()
    expect((await current.boundingBox())!.height).toBeGreaterThan(64)
    const currentBox = (await current.boundingBox())!
    const labelBox = (await current.locator('[data-current-track-label]').boundingBox())!
    expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(currentBox.y + currentBox.height)
    const artistBox = (await current.getByText('Artist 1', { exact: true }).boundingBox())!
    expect(artistBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height)
    expect((await current.boundingBox())!.height).toBeGreaterThanOrEqual(64)
    await expect(current).toBeInViewport()
    await page.screenshot({ animations: 'disabled', path: `/tmp/gurach-imp06/queue-${width}.png` })
    await queue.getByRole('button', { name: 'Закрыть', exact: true }).click()

    if (width < 900) await page.getByRole('button', { name: 'Открыть меню', exact: true }).click()
    const active = page.getByRole('navigation').getByRole('link', { name: 'Все треки', exact: true })
    await expect(active).toHaveAttribute('aria-current', 'page')
    await expect(active.locator('svg')).toBeVisible()
    await active.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(active).toBeFocused()
    await expect(active).toHaveCSS('box-shadow', 'rgb(152, 96, 73) 3px 0px 0px 0px inset')
    await page.screenshot({ animations: 'disabled', path: `/tmp/gurach-imp06/navigation-${width}.png` })
    if (width < 900) await page.keyboard.press('Escape')
    await expect(main.getByRole('heading', { level: 1 })).toBeVisible()
    expect(parseFloat(await main.getByRole('heading', { level: 1 }).evaluate(node => getComputedStyle(node).fontSize))).toBeLessThanOrEqual(40)
    await page.goto('/tracks/000000000000000000000001')
    expect(parseFloat(await page.getByRole('heading', { level: 1 }).evaluate(node => getComputedStyle(node).fontSize))).toBeGreaterThan(width < 600 ? 28 : 40)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
