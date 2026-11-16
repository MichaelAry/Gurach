import { formatNumber, translate, type Locale } from '@/i18n/messages'
export function pluralRu(n: number, forms: [string, string, string]): string {
  const category = new Intl.PluralRules('ru').select(n)
  return forms[category === 'one' ? 0 : category === 'few' ? 1 : 2]
}
const pluralRules = { en: new Intl.PluralRules('en'), ru: new Intl.PluralRules('ru') }
export function formatListens(n: number, locale: Locale = 'en'): string {
  const category = pluralRules[locale].select(n)
  const key = category === 'one' ? 'listen_one' : category === 'few' ? 'listen_few' : category === 'many' ? 'listen_many' : 'listen_other'
  return translate(locale, 'ui', key, { count: formatNumber(locale, n) })
}
