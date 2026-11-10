export function safeReturnPath(value: string | null | undefined): string {
  if (!value || value !== value.trim() || !value.startsWith('/') || value.startsWith('//') || /[%\\\x00-\x20]/.test(value)) return '/tracks'
  try {
    const url = new URL(value, 'https://local.invalid')
    if (url.origin !== 'https://local.invalid' || !/^\/(?:tracks(?:\/[a-f\d]{24})?|upload|account)?\/?$/i.test(url.pathname)) return '/tracks'
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return '/tracks' }
}
