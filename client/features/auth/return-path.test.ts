import { expect, it } from 'vitest'
import { safeReturnPath } from './return-path'
it('accepts local product routes and rejects external or encoded redirects', () => {
  expect(safeReturnPath('/upload')).toBe('/upload')
  expect(safeReturnPath('/account')).toBe('/account')
  expect(safeReturnPath('/tracks?view=all')).toBe('/tracks?view=all')
  for (const value of ['//evil.example', 'https://evil.example', '/\\evil.example', '/%2f%2fevil', '/%252f%252fevil', '/login?returnTo=//evil', '/api/auth/logout', '/tracks\n']) {
    expect(safeReturnPath(value)).toBe('/tracks')
  }
})
