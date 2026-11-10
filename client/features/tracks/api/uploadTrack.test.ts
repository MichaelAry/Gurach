import { afterEach, expect, it, vi } from 'vitest'
import { uploadTrack } from './uploadTrack'

afterEach(() => vi.unstubAllGlobals())

it('sends multipart with browser-generated boundary and CSRF header', async () => {
  const body = new FormData()
  body.set('name', 'Track')
  const signal = new AbortController().signal
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ _id: 'A'.repeat(24) }, { status: 201 })))
  expect(await uploadTrack(body, signal)).toBe('a'.repeat(24))
  expect(fetch).toHaveBeenCalledWith('/api/tracks', {
    method: 'POST', body, signal, credentials: 'same-origin', headers: { 'X-Gurach-Request': '1' },
  })
})

it.each([{}, { _id: 'javascript:alert(1)' }, { _id: '../login' }, null])('does not navigate using invalid success payload %j', async (payload) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload, { status: 201 })))
  await expect(uploadTrack(new FormData(), new AbortController().signal)).rejects.toThrow('Проверьте каталог')
})

it.each([
  [400, 'Проверьте название'], [401, 'Сессия истекла'], [403, 'Загрузка запрещена'],
  [409, 'конфликта'], [413, '50 МиБ'], [415, 'повреждён'], [429, 'Подождите минуту'],
  [502, 'недоступен'], [504, 'трек мог загрузиться'], [500, 'Не удалось загрузить'],
] as const)('explains HTTP %s without exposing upstream details', async (status, message) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private details', { status })))
  await expect(uploadTrack(new FormData(), new AbortController().signal)).rejects.toThrow(message)
})

it('explains lost connections and does not automatically retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  await expect(uploadTrack(new FormData(), new AbortController().signal)).rejects.toThrow('Соединение прервано')
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('preserves cancellation so an unmounted form can ignore it', async () => {
  const controller = new AbortController()
  controller.abort()
  const error = new DOMException('Cancelled', 'AbortError')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))
  await expect(uploadTrack(new FormData(), controller.signal)).rejects.toBe(error)
})
