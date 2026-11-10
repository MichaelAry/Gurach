export interface ApiErrorEnvelope {
  error: {
    code: string
    message: string
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

export function formatApiError(error: ApiErrorEnvelope['error'] | null, fallback: string): string {
  if (!error) return fallback
  return `${error.message} [${error.code}; request ${error.requestId}]`
}
