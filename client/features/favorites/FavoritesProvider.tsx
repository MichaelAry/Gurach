'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, Snackbar } from '@mui/material'
import { useViewer } from '@/features/auth/ViewerProvider'

const FavoritesContext = createContext<{
  ids: Set<string>; pending: Set<string>; loading: boolean; revision: number
  toggle: (id: string) => Promise<void>; refresh: () => void
} | null>(null)
export function useFavorites() {
  const context = useContext(FavoritesContext)
  if (!context) throw new Error('FavoritesProvider is missing')
  return context
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useViewer()
  return <FavoritesSession key={user?.id ?? 'guest'} authenticated={Boolean(user)} sessionLoading={loading}>{children}</FavoritesSession>
}

function FavoritesSession({ children, authenticated, sessionLoading }: { children: ReactNode; authenticated: boolean; sessionLoading: boolean }) {
  const [ids, setIds] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(new Set<string>())
  const generation = useRef(0)
  const active = useRef(false)
  const controller = useRef<AbortController | null>(null)

  const refresh = useCallback(() => {
    if (!authenticated || busy.current.size) return
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    const version = ++generation.current
    void fetch('/api/account/favorite-ids', { cache: 'no-store', signal: request.signal }).then(async (response) => {
      if (!response.ok) throw new Error()
      const values: unknown = await response.json()
      if (!Array.isArray(values) || !values.every((id) => typeof id === 'string')) throw new Error()
      if (active.current && version === generation.current) {
        setIds(new Set(values)); setReady(true); setError(null); setRevision((old) => old + 1)
      }
    }).catch(() => {
      if (active.current && !request.signal.aborted && version === generation.current) setError('Не удалось загрузить избранное. Повторите попытку.')
    })
  }, [authenticated])

  useEffect(() => {
    active.current = true
    refresh()
    window.addEventListener('focus', refresh)
    return () => { active.current = false; controller.current?.abort(); window.removeEventListener('focus', refresh) }
  }, [refresh])

  async function toggle(id: string) {
    if (!authenticated || !ready || busy.current.has(id)) return
    busy.current.add(id)
    setPending(new Set(busy.current))
    setError(null)
    ++generation.current
    const favorite = !ids.has(id)
    try {
      const response = await fetch(`/api/account/favorites/${encodeURIComponent(id)}`, {
        method: favorite ? 'PUT' : 'DELETE', headers: { 'x-gurach-request': '1' },
      })
      if (!response.ok) throw new Error()
      if (active.current) {
        setIds((old) => { const next = new Set(old); if (favorite) next.add(id); else next.delete(id); return next })
        setRevision((old) => old + 1)
      }
    } catch {
      if (active.current) setError('Не удалось изменить избранное. Попробуйте ещё раз.')
    } finally {
      busy.current.delete(id)
      if (active.current) setPending(new Set(busy.current))
    }
  }

  return <FavoritesContext.Provider value={{ ids, pending, loading: sessionLoading || (authenticated && !ready), revision, toggle, refresh }}>
    {children}
    <Snackbar open={Boolean(error)} onClose={() => setError(null)}>
      <Alert severity="error" onClose={() => setError(null)} action={<Button color="inherit" onClick={refresh}>Повторить</Button>}>{error}</Alert>
    </Snackbar>
  </FavoritesContext.Provider>
}
