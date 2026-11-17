import { describe, expect, it } from 'vitest'
import { playerReturnPath } from './returnPath'

describe('player return destination', () => {
  it.each(['/', '/tracks?search=hello%20world&page=2#results', '/favorites', '/playlists', '/playlists/shared/abc-123', '/tracks/abcdef123456abcdef123456'])('preserves app page %s', (path) => {
    expect(playerReturnPath(path)).toBe(path)
  })
  it.each([null, '', 'https://example.com', '//example.com', '/\\example.com', '/player', '/player?returnTo=/', '/api/auth/logout', '/login', '/tracks/../player', '/%70layer', '/tracks\n'])('falls back for invalid or recursive destination %s', (path) => {
    expect(playerReturnPath(path)).toBe('/tracks')
  })
})
