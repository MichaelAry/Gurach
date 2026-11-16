'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import en from '@/messages/en.json'
import ru from '@/messages/ru.json'

export type Locale = 'en' | 'ru'
type Messages = typeof en
type Namespace = keyof Messages
type TranslationKey<N extends Namespace> = keyof Messages[N] & string
const dictionaries: Record<Locale, Messages> = { en, ru }
const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({
  locale: 'en',
  setLocale: () => {},
})

export function LocaleProvider({ children, initialLocale = 'en' }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale)
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next)
    document.cookie = `NEXT_LOCALE=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  }, [])
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}

export function useTranslations<N extends Namespace>(namespace: N) {
  const { locale } = useLocale()
  return useCallback((key: TranslationKey<N>): string => dictionaries[locale][namespace][key] as string, [locale, namespace])
}
