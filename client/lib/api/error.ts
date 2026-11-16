import { message, type UiKey } from '@/i18n/messages'
export interface ApiErrorEnvelope {
  error: {
    code: string
    message: string
    existingTrackId?: string
    duplicateReason?: 'identity' | 'file_sha256' | 'decoded_audio_sha256' | 'chromaprint'
    fieldErrors?: Record<string, string[]>
    requestId: string
  }
}

export async function readApiError(response: Response): Promise<ApiErrorEnvelope | null> {
  try {
    const value: unknown = await response.json()
    if (typeof value !== 'object' || value === null || !('error' in value)) return null
    const error = value.error
    if (
      typeof error !== 'object' || error === null ||
      !('code' in error) || typeof error.code !== 'string' ||
      !('message' in error) || typeof error.message !== 'string' ||
      !('requestId' in error) || typeof error.requestId !== 'string'
    ) return null
    return value as ApiErrorEnvelope
  } catch {
    return null
  }
}

const publicErrorKeys: Record<string, UiKey> = {
  VALIDATION_ERROR: 'apiValidation', UNAUTHORIZED: 'apiUnauthorized', FORBIDDEN: 'apiForbidden',
  NOT_FOUND: 'apiNotFound', CONFLICT: 'apiConflict', PAYLOAD_TOO_LARGE: 'apiTooLarge',
  UNSUPPORTED_MEDIA_TYPE: 'apiMedia', RATE_LIMITED: 'apiRateLimit',
  INTERNAL_ERROR: 'apiUnavailable', BACKEND_UNAVAILABLE: 'apiUnavailable', BACKEND_TIMEOUT: 'apiUnavailable',
  TRACK_UNAVAILABLE: 'trackUnavailable', QUEUE_FULL: 'apiQueueFull', QUEUE_ENTRY_INVALID: 'apiQueueInvalid',
  QUEUE_CONFLICT: 'apiConflict', TRACK_DUPLICATE: 'theServerDetectedADuplicateOfAnExistingTrack',
}
export function formatApiError(error: ApiErrorEnvelope['error'] | null, fallback: string): string {
  if (!error) return fallback
  return message('apiErrorReference', {
    message: publicErrorKeys[error.code] ? message(publicErrorKeys[error.code]) : fallback,
    code: error.code, requestId: error.requestId,
  })
}
