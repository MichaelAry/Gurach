import en from '@/messages/en.json'
import ru from '@/messages/ru.json'

export type Locale = 'en' | 'ru'
export type Values = Record<string, string | number | null | undefined>
export type UiKey = keyof typeof en.ui
export type Namespace = keyof typeof en
export const isLocale = (value: unknown): value is Locale => value === 'en' || value === 'ru'
export const normalizeLocale = (value: unknown): Locale => isLocale(value) ? value : 'en'
const dictionaries: Record<Locale, typeof en> = { en, ru }

// Deferred messages keep asynchronous errors independent of the language in which
// the request started. They are resolved only where the UI renders them.
export function message(key: UiKey, values: Values = {}): string {
  return `~i18n:${encodeURIComponent(JSON.stringify([key, values])).replace(/~/g, '%7E')}~`
}
export function translate<N extends Namespace>(locale: Locale, namespace: N, key: keyof typeof en[N] & string, values: Values = {}): string {
  const template = dictionaries[locale][namespace][key] ?? en[namespace][key]
  return String(template).replace(/\{(\w+)\}/g, (match, name: string) => name in values ? String(values[name] ?? '') : match)
}
export function resolveMessage(locale: Locale, value: string | null | undefined): string {
  if (!value) return ''
  if (/^(?:TypeError: )?(?:Failed to fetch|fetch failed|Load failed|NetworkError.*)$/.test(value)) return translate(locale, 'ui', 'couldNotReachTheServerCheckYourConnection')
  value = value.replace(/^Error: (?=~i18n:)/, '')
  if (value === 'QUEUE_FULL') return translate(locale, 'ui', 'apiQueueFull')
  if (value === 'QUEUE_ENTRY_INVALID') return translate(locale, 'ui', 'apiQueueInvalid')
  return value.replace(/~i18n:([^~]+)~/g, (original, encoded: string) => {
    try {
      const [key, values] = JSON.parse(decodeURIComponent(encoded))
      if (!Object.hasOwn(en.ui, key)) return original
      const resolved = Object.fromEntries(Object.entries(values as Values).map(([name, entry]) => [name, typeof entry === 'string' ? resolveMessage(locale, entry) : entry]))
      return translate(locale, 'ui', key, resolved)
    } catch { return original }
  })
}

const numbers = new Map<Locale, Intl.NumberFormat>()
export function formatNumber(locale: Locale, value: number) {
  if (!numbers.has(locale)) numbers.set(locale, new Intl.NumberFormat(locale))
  return numbers.get(locale)!.format(value)
}
export function formatDate(locale: Locale, value: string, dateOnly = false) {
  const date = new Date(value)
  if (!Number.isFinite(date.valueOf())) return translate(locale, 'ui', 'dateUnknown')
  return dateOnly ? date.toLocaleDateString(locale) : date.toLocaleString(locale)
}

export const uiTextFor = (locale: Locale) => (key: UiKey, values?: Values) => resolveMessage(locale, translate(locale, 'ui', key, values))
