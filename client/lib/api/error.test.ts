import { describe, expect, it } from 'vitest'
import { formatApiError, readApiError } from './error'

describe('API error envelope', () => {
  it('reads code, validation fields and request ID from an error response', async () => {
    const response = Response.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        fieldErrors: { username: ['should not be empty'] },
        requestId: 'request-123',
      },
    }, { status: 400 })

    const error = await readApiError(response)
    expect(error?.error.fieldErrors).toEqual({ username: ['should not be empty'] })
    expect(formatApiError(error?.error ?? null, 'fallback')).toContain('request-123')
  })

  it('does not treat arbitrary response bodies as API errors', async () => {
    expect(await readApiError(Response.json({ message: 'not the API envelope' }))).toBeNull()
    expect(formatApiError(null, 'fallback')).toBe('fallback')
  })
})
