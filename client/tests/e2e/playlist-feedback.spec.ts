import { expect, test } from '@playwright/test'
import type { components } from '@/lib/api/schema'

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: 'gurach_session', value: 'a'.repeat(43), domain: '127.0.0.1', path: '/', httpOnly: true }])
  const view: components['schemas']['PlaylistView'] = {
    id: 'c'.repeat(24), ownerId: 'a'.repeat(24), name: 'Feedback playlist', visibility: 'private', revision: 1,
    entries: [
      { trackId: '000000000000000000000001', track: { _id: '000000000000000000000001', name: 'Track 1', artist: 'Artist 1', audio: 'http://127.0.0.1:5300/static/audio/track-1.mp3', picture: null, duration: 180, listens: 0 } },
      { trackId: 'e'.repeat(24), track: null },
    ],
  }
  await page.route('**/api/playlists**', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname.endsWith('/sharing')) {
      const { visibility } = request.postDataJSON()
      view.visibility = visibility
      await route.fulfill({ json: { revision: ++view.revision, token: visibility === 'link' ? 'example-token' : null } })
    } else if (url.pathname === '/api/playlists') {
      await route.fulfill({ json: { items: [{ id: view.id, name: view.name }] } })
    } else {
      if (request.method() === 'PUT') { view.name = request.postDataJSON().name; view.revision++ }
      await route.fulfill({ json: view })
    }
  })
  await page.goto('/playlists')
  await page.getByRole('button', { name: 'Feedback playlist', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Воспроизвести', exact: true })).toBeEnabled()
})

test('combines skipping unavailable tracks and queue replacement in one keyboard confirmation', async ({ page }) => {
  let writes = 0
  page.on('request', request => { if (request.url().endsWith('/api/queue') && request.method() === 'PUT') writes++ })
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Заменить текущую очередь этим плейлистом?' })
  await expect(dialog).toContainText('Недоступных треков: 1')
  const cancel = dialog.getByRole('button', { name: 'Отмена', exact: true })
  await expect(cancel).toBeFocused()
  await cancel.press('Enter')
  expect(writes).toBe(0)
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click()
  await dialog.getByRole('button', { name: 'Подтвердить', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Очередь обновлена.')
  await expect(page.getByRole('contentinfo').getByRole('button', { name: 'Открыть очередь, 1 из 100', exact: true })).toBeVisible()
  expect(writes).toBe(1)
})

test('shows queue failures inside the confirmation and save and sharing results near their controls', async ({ page }) => {
  await page.route('**/api/queue', async route => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 503, json: {} })
    else await route.continue()
  })
  await page.getByRole('button', { name: 'Добавить в очередь', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Добавить в очередь' })
  await expect(dialog).toContainText('Недоступных треков: 1')
  await dialog.getByRole('button', { name: 'Подтвердить', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.getByRole('status')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click()
  await page.getByRole('button', { name: 'Сохранить название и порядок', exact: true }).click()
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Плейлист сохранён.')
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Создать / обновить ссылку', exact: true }).click()
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Ссылка на плейлист создана.')
  await page.getByRole('button', { name: 'Отозвать ссылку', exact: true }).click()
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Ссылка на плейлист отозвана.')
  await page.route('**/api/playlists/' + 'c'.repeat(24), route => route.fulfill({ status: 409, json: {} }))
  await page.getByRole('button', { name: 'Сохранить название и порядок', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Плейлист изменён')
  await expect(page.getByRole('main').getByRole('status')).toHaveCount(0)
})
