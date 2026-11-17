'use client'
import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isLocale, uiTextFor, resolveMessage, translate, type Locale, type Namespace, type Values } from './messages'
import en from '@/messages/en.json'
export type { Locale } from './messages'

const LocaleContext = createContext<{
  locale: Locale; setLocale: (locale: Locale) => void
}>({ locale: 'en', setLocale: () => {} })

const LocaleSyncContext = createContext<{
  syncError: boolean; syncPending: boolean; retrySync: () => void
}>({ syncError: false, syncPending: false, retrySync: () => {} })

export function LocaleProvider({ children, initialLocale = 'en' }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale)
  const [syncError, setSyncError] = useState(false)
  const [syncPending, setSyncPending] = useState(false)
  const current = useRef(initialLocale)
  const generation = useRef(0)
  const account = useRef<string | null>(null)
  const channel = useRef<BroadcastChannel | null>(null)
  const writes = useRef(Promise.resolve())
  const pending = useRef<{ accountId: string; locale: Locale } | null>(null)
  const apply = useCallback((next: Locale, broadcast = true) => {
    current.current = next
    startTransition(() => updateLocale(next))
    document.documentElement.lang = next
    try { document.cookie = `NEXT_LOCALE=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}` } catch { /* The in-memory selection still works if cookies are blocked. */ }
    if (broadcast) channel.current?.postMessage(next)
  }, [])
  const save = useCallback((next: Locale, accountId: string, initialize = false) => {
    const version = ++generation.current
    pending.current = { accountId, locale: next }
    setSyncPending(true)
    // Serialize this tab's writes so an older request cannot overwrite a newer one.
    writes.current = writes.current.catch(() => {}).then(async () => {
      if (account.current !== accountId || version !== generation.current) return
      try {
        const response = await fetch('/api/account/preferences', {
          method: 'PUT', headers: { 'content-type': 'application/json', 'X-Gurach-Request': '1' },
          body: JSON.stringify({ preferredLocale: next, initialize }),
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) throw new Error('Preference update failed')
        const result = await response.json()
        if (!isLocale(result.preferredLocale)) throw new Error('Invalid preference response')
        if (account.current === accountId && version === generation.current) {
          pending.current = null
          setSyncPending(false)
          setSyncError(false)
          if (isLocale(result.preferredLocale)) apply(result.preferredLocale)
        }
      } catch {
        if (account.current === accountId && version === generation.current) { setSyncPending(false); setSyncError(true) }
      }
    })
  }, [apply])
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return
    generation.current++
    apply(next)
    if (account.current) save(next, account.current)
  }, [apply, save])
  const retrySync = useCallback(() => {
    if (pending.current && account.current === pending.current.accountId) save(pending.current.locale, pending.current.accountId)
  }, [save])
  useEffect(() => {
    let disposed = false
    let lookup: AbortController | null = null
    const check = async () => {
      lookup?.abort()
      const controller = new AbortController()
      lookup = controller
      const version = generation.current
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) })
        if (disposed || controller.signal.aborted) return
        if (response.status === 401) {
          account.current = null; pending.current = null; generation.current++; setSyncError(false); setSyncPending(false)
          return
        }
        if (!response.ok) return
        const { user } = await response.json()
        if (disposed || controller.signal.aborted || !user || typeof user.id !== 'string') return
        const changedAccount = account.current !== user.id
        if (changedAccount) { pending.current = null; setSyncError(false); setSyncPending(false) }
        account.current = user.id
        if (pending.current) return
        if (version !== generation.current) { save(current.current, user.id); return }
        if (isLocale(user.preferredLocale)) apply(user.preferredLocale)
        else save(current.current, user.id, true)
      } catch { /* Locale selection remains available while the API is offline. */ }
    }
    if (typeof BroadcastChannel !== 'undefined') {
      try { channel.current = new BroadcastChannel('gurach:locale') } catch { /* Synchronize on focus when browser channels are unavailable. */ }
      if (channel.current) channel.current.onmessage = ({ data }) => { if (isLocale(data)) apply(data, false) }
    }
    const onSession = () => { account.current = null; pending.current = null; generation.current++; setSyncPending(false); setSyncError(false); void check() }
    const onFocus = () => { void check() }
    void check()
    window.addEventListener('focus', onFocus)
    window.addEventListener('gurach:session', onSession)
    return () => {
      disposed = true; lookup?.abort(); channel.current?.close(); channel.current = null
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('gurach:session', onSession)
    }
  }, [apply, save])
  const context = useMemo(() => ({ locale, setLocale }), [locale, setLocale])
  const sync = useMemo(() => ({ syncError, syncPending, retrySync }), [syncError, syncPending, retrySync])
  return <LocaleContext.Provider value={context}><LocaleSyncContext.Provider value={sync}>{children}</LocaleSyncContext.Provider></LocaleContext.Provider>
}
export function useLocale() { return useContext(LocaleContext) }
export function useLocaleSync() { return useContext(LocaleSyncContext) }
export function useText() {
  const { locale } = useLocale()
  return useMemo(() => uiTextFor(locale), [locale])
}
export function useTranslations<N extends Namespace>(namespace: N) {
  const { locale } = useLocale()
  return useCallback((key: keyof typeof en[N] & string, values?: Values) => translate(locale, namespace, key, values), [locale, namespace])
}

export function useMessage() {
  const { locale } = useLocale()
  return useCallback((value: string | null | undefined) => resolveMessage(locale, value), [locale])
}
