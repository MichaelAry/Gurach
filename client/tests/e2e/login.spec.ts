import { expect, test } from '@playwright/test'
test('logs in, opens home, displays identity and clears session on logout', async ({ page, context }) => {
  await page.goto('/login?returnTo=/tracks')
  await page.getByLabel('Имя пользователя').fill('fixture_user')
  await page.getByLabel('Пароль').fill('wrong password')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Неверное имя' })).toContainText('Неверное имя')
  await expect(page.getByLabel('Имя пользователя')).toHaveValue('fixture_user')
  await page.getByLabel('Пароль').fill('fixture password long')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Пользователь теста', { exact: true })).toBeVisible()
  const cookie = (await context.cookies()).find((value) => value.name === 'gurach_session')
  expect(cookie?.httpOnly).toBe(true)
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Войти', exact: true })).toBeVisible()
  expect((await context.cookies()).some((value) => value.name === 'gurach_session')).toBe(false)
})

test('rejects CSRF, discards unsafe return destinations and clears an invalid session', async ({ page, context }) => {
  const missing = await context.request.post('/api/auth/login', { data: { username: 'fixture_user', password: 'fixture password long' } })
  expect(missing.status()).toBe(403)
  const foreign = await context.request.post('/api/auth/logout', { headers: { origin: 'https://foreign.invalid', 'X-Gurach-Request': '1' } })
  expect(foreign.status()).toBe(403)
  await page.goto('/login?returnTo=%2F%2Fevil.invalid')
  await page.getByLabel('Имя пользователя').fill('fixture_user')
  await page.getByLabel('Пароль').fill('fixture password long')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await context.addCookies([{ name: 'gurach_session', value: 'z'.repeat(43), domain: '127.0.0.1', path: '/', httpOnly: true }])
  await page.reload()
  await expect(page.getByRole('link', { name: 'Войти', exact: true })).toBeVisible()
  expect((await context.request.post('/api/auth/logout', { headers: { origin: 'http://127.0.0.1:3200', 'X-Gurach-Request': '1' } })).status()).toBe(204)
  expect((await context.cookies()).some((cookie) => cookie.name === 'gurach_session')).toBe(false)
})

test('does not reuse the previous identity across logout and login', async ({ page }) => {
  for (const [username, displayName, previous] of [
    ['fixture_user', 'Пользователь теста', 'Другой пользователь'],
    ['fixture_other', 'Другой пользователь', 'Пользователь теста'],
  ]) {
    await page.goto('/login')
    await page.getByLabel('Имя пользователя').fill(username)
    await page.getByLabel('Пароль').fill('fixture password long')
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText(displayName, { exact: true })).toBeVisible()
    await expect(page.getByText(previous, { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Выйти', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Войти', exact: true })).toBeVisible()
  }
})
