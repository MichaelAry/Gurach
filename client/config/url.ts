const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

export function normalizeHttpBaseUrl(name: string, raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL`)
  }
  if (
    !HTTP_PROTOCOLS.has(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an HTTP(S) base URL without credentials, query, or fragment`)
  }
  return url.toString().replace(/\/+$/, '')
}
