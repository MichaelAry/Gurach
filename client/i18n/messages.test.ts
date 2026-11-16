import { describe, expect, it } from 'vitest'
import { formatListens } from '@/features/tracks/utils/formatListens'
import { formatApiError } from '@/lib/api/error'
import { isLocale, message, normalizeLocale, resolveMessage, uiTextFor } from './messages'

describe('localization', () => {
  it('defaults to English and accepts only supported locales', () => {
    for (const value of [undefined, null, '', 'de', 'RU', '__proto__']) expect(normalizeLocale(value)).toBe('en')
    expect(isLocale('ru')).toBe(true)
    expect(normalizeLocale('ru')).toBe('ru')
  })
  it('renders the same deferred error in either language, including nested parameters', () => {
    const error = message('apiErrorReference', { message: message('couldNotReachTheServerCheckYourConnection'), code: 'BACKEND_UNAVAILABLE', requestId: 'request-123' })
    expect(resolveMessage('en', error)).toBe('Could not reach the server. Check your connection. [Code: BACKEND_UNAVAILABLE; request ID: request-123]')
    expect(resolveMessage('ru', error)).toContain('Не удалось связаться с сервером.')
    expect(resolveMessage('ru', error)).toContain('ID запроса: request-123')
  })
  it('keeps user content unchanged and does not interpolate a parameter twice', () => {
    expect(resolveMessage('en', 'Мой трек {count}')).toBe('Мой трек {count}')
    expect(resolveMessage('ru', message('artistDescription', { name: '{artist}', artist: 'Test' }))).toBe('{artist} — Test')
  })
  it('uses localized public errors and keeps unknown upstream messages out of the UI', () => {
    const error = formatApiError({ code: 'FORBIDDEN', message: 'private server details', requestId: '123' }, message('couldNotCompleteTheRequest165'))
    expect(resolveMessage('ru', error)).toContain('У вас нет права')
    expect(resolveMessage('en', error)).not.toContain('private server details')
    expect(resolveMessage('ru', 'Failed to fetch')).toContain('Проверьте соединение')
  })
  it.each([
    [0, '0 прослушиваний'], [1, '1 прослушивание'], [2, '2 прослушивания'], [5, '5 прослушиваний'],
    [11, '11 прослушиваний'], [21, '21 прослушивание'], [22, '22 прослушивания'], [111, '111 прослушиваний'],
  ])('formats Russian listens: %s', (count, expected) => expect(formatListens(count, 'ru')).toBe(expected))
  it('formats English listens and complete parameterized messages', () => {
    expect(formatListens(1)).toBe('1 listen')
    expect(formatListens(2)).toBe('2 listens')
    expect(uiTextFor('en')('selection', { count: 2, remaining: 98 })).toBe('Selected: 2; available spaces: 98 of 100')
  })
})
