const localOrigin = 'https://local.invalid'
const productPath = /^\/(?:tracks(?:\/[a-f\d]{24})?|upload|account|favorites|friends|users\/[a-zA-Z0-9_]+)?\/?$/

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value)) return '/'
  try {
    // Search and fragment may contain encoding; the pathname must be unambiguous.
    const pathname = value.split(/[?#]/, 1)[0]
    if (pathname.includes('%') || /%(?![a-f\d]{2})/i.test(value)) return '/'
    const url = new URL(value, localOrigin)
    if (url.origin !== localOrigin || url.pathname !== pathname || !productPath.test(url.pathname)) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return '/' }
}
