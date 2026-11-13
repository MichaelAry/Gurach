import { expect, it } from 'vitest'
import { safeReturnPath } from './return-path'

it.each([
  '/', '/tracks', '/tracks/', '/tracks/0123456789abcdef01234567',
  '/upload', '/account', '/favorites', '/friends', '/users/alice_1',
  '/tracks?search=%D0%BC%D1%83%D0%B7%D1%8B%D0%BA%D0%B0&page=2',
  '/tracks?search=hello+world&filter=a%26b%3Dc#results',
  '/tracks/0123456789abcdef01234567?view=all#comment-123',
  '/users/alice_1?tab=tracks#%D1%82%D1%80%D0%B5%D0%BA',
])('preserves safe product URL %s', (value) => {
  expect(safeReturnPath(value)).toBe(value)
})

it.each([
  undefined, null, '', '//evil.example', 'https://evil.example',
  'javascript:alert(1)', '/\\evil.example', '/%2f%2fevil', '/%252f%252fevil',
  '/%74racks', '/tracks%2f0123456789abcdef01234567',
  '/login?returnTo=//evil', '/register', '/auth/login', '/api/auth/logout',
  '/tracks/../account', '/api/../tracks', '/tracks/./',
  '/tracks/%2e%2e/account', '/tracks//', '/TRACKS', '/tracks/not-an-id',
  '/users', '/users/alice/extra', '/users/..', '/other',
  '/tracks\n', ' /tracks', '/tracks ', '/tracks\t?search=x', '/tracks\x7f',
  '/tracks?search=%ZZ', '/tracks#%',
])('falls back to home for missing or unsafe URL %j', (value) => {
  expect(safeReturnPath(value)).toBe('/')
})

it('accepts a search URL after the login query is decoded once', () => {
  const target = '/tracks?search=%D0%BC%D1%83%D0%B7%D1%8B%D0%BA%D0%B0#comment-123'
  const params = new URLSearchParams(`returnTo=${encodeURIComponent(target)}`)
  expect(safeReturnPath(params.get('returnTo'))).toBe(target)
})
