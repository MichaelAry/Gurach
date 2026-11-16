import 'server-only'
import { checkBrowserMutation } from './csrf'
import { readBoundedJson } from './bounded-json'
import { proxySessionBackend } from './session'
import { proxyBackend } from './backend'
import { socialInvalid } from './social-bff'
export async function playlistProxy(request: Request, path: string, shared = false) {
  if (new URL(request.url).search) return socialInvalid()
  let body: string | undefined
  if (request.method !== 'GET') {
    const rejected = checkBrowserMutation(request)
    if (rejected) return rejected
    try { body = JSON.stringify(await readBoundedJson(request)) }
    catch (error) { return socialInvalid('Invalid playlist body', error instanceof RangeError ? 413 : 400) }
  }
  const init = { method: request.method, body, signal: request.signal, headers: { 'content-type': 'application/json' } }
  const response = await (shared ? proxyBackend(path, init) : proxySessionBackend(path, init))
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
