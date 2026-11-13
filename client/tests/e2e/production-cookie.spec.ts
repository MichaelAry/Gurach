import { expect, test } from '@playwright/test'
test('sets and clears host-only Secure HttpOnly production cookie through HTTPS', async ({ page, context }) => {
  await page.goto('/login?returnTo=/tracks')
  await page.getByLabel('Имя пользователя').fill('fixture_user')
  await page.getByLabel('Пароль').fill('fixture password long')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL('/tracks')
  const cookie = (await context.cookies()).find((item) => item.name === '__Host-gurach_session')
  expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/', domain: '127.0.0.1' })
  expect(await page.evaluate(() => document.cookie)).not.toContain('__Host-gurach_session')
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Войти', exact: true })).toBeVisible()
  expect((await context.cookies()).some((item) => item.name === '__Host-gurach_session')).toBe(false)
})
