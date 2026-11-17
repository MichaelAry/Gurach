const origin = 'https://local.invalid'
const mainPage = /^\/(?:tracks(?:\/[a-f\d]{24})?|upload|account|favorites|friends|notifications|users\/[a-zA-Z0-9_]+|playlists(?:\/shared\/[a-zA-Z0-9_-]+)?)?\/?$/

export function playerReturnPath(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value)) return '/tracks'
  try {
    const url = new URL(value, origin)
    const pathname = value.split(/[?#]/, 1)[0]
    if (url.origin !== origin || url.pathname !== pathname || !mainPage.test(pathname)) return '/tracks'
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return '/tracks' }
}
