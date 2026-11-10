'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface Viewer { id: string; username: string; displayName: string; role: 'user' | 'admin' }
const ViewerContext = createContext<{ user: Viewer | null; loading: boolean; error: boolean }>({ user: null, loading: true, error: false })
export const useViewer = () => useContext(ViewerContext)
export function ViewerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: Viewer | null; loading: boolean; error: boolean }>({ user: null, loading: true, error: false })
  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => { void fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (response.status === 401) return null
      if (!response.ok) throw new Error('Session unavailable')
      return (await response.json()).user as Viewer
    }).then((user) => { if (!controller.signal.aborted) setState({ user, loading: false, error: false }) })
      .catch(() => { if (!controller.signal.aborted) setState({ user: null, loading: false, error: true }) })
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { controller.abort(); window.removeEventListener('focus', refresh) }
  }, [])
  return <ViewerContext.Provider value={state}>{children}</ViewerContext.Provider>
}
