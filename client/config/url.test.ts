import { describe, expect, it } from 'vitest'
import { normalizeHttpBaseUrl } from './url'

describe('normalizeHttpBaseUrl', () => {
  it('normalizes a valid base URL', () => {
    expect(normalizeHttpBaseUrl('API_URL', 'https://api.example.test/v1/')).toBe(
      'https://api.example.test/v1',
    )
  })

  it.each([
    'ftp://api.example.test',
    'https://user:secret@api.example.test',
    'https://api.example.test?token=secret',
    'https://api.example.test/#fragment',
  ])('rejects unsupported or credential-bearing URL %s', (value) => {
    expect(() => normalizeHttpBaseUrl('API_URL', value)).toThrow()
  })
})
