import 'server-only'
import { apiErrorResponse } from './api-error-response'

export function checkBrowserMutation(request: Request): Response | null {
  const configured = process.env.APP_ORIGIN ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000')
  let origin: string
  try {
    const url = new URL(configured)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== configured) throw new Error('Invalid origin')
    origin = url.origin
  } catch {
    return apiErrorResponse(503, 'UNAVAILABLE', 'Application origin is not configured')
  }
  if (request.headers.get('origin') !== origin || request.headers.get('x-gurach-request') !== '1') {
    return apiErrorResponse(403, 'FORBIDDEN', 'Untrusted browser request', request.headers.get('x-request-id'))
  }
  return null
}
