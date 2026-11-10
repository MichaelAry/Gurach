import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ connection: async () => undefined }))
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag }))
const { cookieJar } = vi.hoisted(() => ({ cookieJar: { get: vi.fn() } }))
vi.mock('next/headers', () => ({ cookies: async () => cookieJar }))

import { POST } from './route'

const token = 'a'.repeat(43)
const browserHeaders = { origin: 'http://localhost:3000', 'x-gurach-request': '1' }
const multipartType = 'multipart/form-data; boundary=test-boundary'

function upload(body: BodyInit = 'multipart bytes', headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/tracks', {
    method: 'POST',
    headers: { ...browserHeaders, 'content-type': multipartType, ...headers },
    body,
    ...('getReader' in Object(body) ? { duplex: 'half' } : {}),
  })
}

beforeEach(() => {
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3000')
  cookieJar.get.mockReturnValue({ value: token })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ _id: 'track-id' }, { status: 201 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('track upload proxy', () => {
  it('expires the public catalogue and track cache after publication', async () => {
    const trackId = 'a'.repeat(24)
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ _id: trackId }, { status: 201 }))
    const response = await POST(upload())
    expect(response.status).toBe(201)
    expect(revalidateTag.mock.calls).toEqual([
      ['tracks', { expire: 0 }], [`track:${trackId}`, { expire: 0 }],
    ])
    expect(await response.json()).toEqual({ _id: trackId })
  })
  it('streams multipart files and fields intact, authenticating only with the session cookie', async () => {
    const form = new FormData()
    form.set('name', 'Мой трек')
    form.set('artist', 'Исполнитель')
    form.set('text', 'Текст песни')
    form.set('audio', new File(['audio bytes'], 'song.mp3', { type: 'audio/mpeg' }))
    form.set('picture', new File(['image bytes'], 'cover.png', { type: 'image/png' }))
    const request = new Request('http://localhost:3000/api/tracks', {
      method: 'POST', body: form,
      headers: { ...browserHeaders, authorization: 'Bearer forged', cookie: 'unrelated=secret', 'x-request-id': 'upload-123' },
    })
    vi.mocked(fetch).mockImplementationOnce(async (url, init) => {
      const forwarded = new Request(url, init)
      expect(forwarded.headers.get('authorization')).toBe(`Bearer ${token}`)
      expect(forwarded.headers.has('cookie')).toBe(false)
      expect(forwarded.headers.get('x-request-id')).toBe('upload-123')
      expect(forwarded.headers.get('content-type')).toBe(request.headers.get('content-type'))
      expect(init).toMatchObject({ method: 'POST', duplex: 'half', cache: 'no-store' })
      expect(init?.body).toBeInstanceOf(ReadableStream)
      const received = await forwarded.formData()
      expect(received.get('name')).toBe('Мой трек')
      expect(received.get('artist')).toBe('Исполнитель')
      expect(received.get('text')).toBe('Текст песни')
      const audio = received.get('audio') as File
      const picture = received.get('picture') as File
      expect(audio.name).toBe('song.mp3')
      expect(await audio.text()).toBe('audio bytes')
      expect(picture.name).toBe('cover.png')
      expect(await picture.text()).toBe('image bytes')
      return Response.json({ _id: 'track-id' }, { status: 201 })
    })
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const response = await POST(request)
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ _id: 'track-id' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(timeout).toHaveBeenCalledWith(120_000)
  })

  it.each<Record<string, string>>([
    { origin: 'https://evil.example' },
    { 'x-gurach-request': '' },
  ])('rejects untrusted browser requests before forwarding: %j', async (headers) => {
    const request = upload('body', headers)
    expect((await POST(request)).status).toBe(403)
    expect(request.bodyUsed).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([undefined, { value: 'invalid-token' }])('rejects missing or malformed sessions', async (cookie) => {
    cookieJar.get.mockReturnValue(cookie)
    const request = upload()
    expect((await POST(request)).status).toBe(401)
    expect(request.bodyUsed).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['application/json', 'multipart/form-data', 'multipart/form-data; boundary=""'])('rejects invalid content type %s', async (contentType) => {
    expect((await POST(upload('body', { 'content-type': contentType }))).status).toBe(415)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects missing bodies and oversized declared payloads before forwarding', async () => {
    const empty = new Request('http://localhost:3000/api/tracks', {
      method: 'POST', headers: { ...browserHeaders, 'content-type': multipartType },
    })
    expect((await POST(empty)).status).toBe(400)
    expect((await POST(upload('body', { 'content-length': String(62 * 1024 * 1024) }))).status).toBe(413)
    expect((await POST(upload('body', { 'content-length': 'invalid' }))).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('bounds streamed uploads even without content-length and cancels the source', async () => {
    const cancel = vi.fn()
    const chunk = new Uint8Array(1024 * 1024)
    const source = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(chunk) },
      cancel,
    })
    vi.mocked(fetch).mockImplementationOnce(async (url, init) => {
      // Consume incrementally, as fetch would, without allocating the complete body.
      const reader = new Request(url, init).body!.getReader()
      while (!(await reader.read()).done) { /* drain */ }
      return new Response()
    })
    const response = await POST(upload(source))
    expect(response.status).toBe(413)
    expect((await response.json()).error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(cancel).toHaveBeenCalled()
  })

  it.each([401, 400, 413, 415, 429])('preserves server error %s and retry information', async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: { code: 'API_ERROR' } }, {
      status, headers: { 'retry-after': '5', 'x-request-id': 'server-123' },
    }))
    const response = await POST(upload())
    expect(response.status).toBe(status)
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(await response.json()).toEqual({ error: { code: 'API_ERROR' } })
    expect(response.headers.get('retry-after')).toBe('5')
    expect(response.headers.get('x-request-id')).toBe('server-123')
  })

  it('hides internal failures and reports upstream timeouts', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('private details', { status: 500 }))
    const failure = await POST(upload())
    expect(failure.status).toBe(502)
    expect(await failure.text()).not.toContain('private details')
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
    expect((await POST(upload())).status).toBe(504)
  })
})
