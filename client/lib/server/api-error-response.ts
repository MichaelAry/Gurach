import 'server-only'

import { randomUUID } from 'node:crypto'
import type { ApiErrorEnvelope } from '@/lib/api/error'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

export function apiErrorResponse(
  status: number,
  code: string,
  message: string,
  incomingRequestId?: string | null,
): Response {
  const requestId = incomingRequestId && REQUEST_ID_PATTERN.test(incomingRequestId)
    ? incomingRequestId
    : randomUUID()
  const body: ApiErrorEnvelope = { error: { code, message, requestId } }
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId },
  })
}
