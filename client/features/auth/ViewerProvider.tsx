'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface Viewer { id: string; username: string; displayName: string; role: 'user' | 'admin' }
interface ViewerState { user: Viewer | null; loading: boolean; error: boolean; confirmed: boolean; resolved: boolean }
interface ViewerSession extends ViewerState {
  isConfirmed: (identity: string | null) => boolean
  refresh: () => void
}
const initial: ViewerState = { user: null, loading: true, error: false, confirmed: false, resolved: false }
const ViewerContext = createContext<ViewerSession>({ ...initial, isConfirmed: () => false, refresh: () => {} })
export const useViewer = () => useContext(ViewerContext)
export function ViewerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ViewerState>(initial)
  const latest = useRef(initial)
  const refreshRef = useRef<() => void>(() => {})
  const refresh = useCallback(() => refreshRef.current(), [])
  // Consumers that finish async work must check the current session, not a stale render.
  const isConfirmed = useCallback((identity: string | null) => latest.current.confirmed && latest.current.resolved && (latest.current.user?.id ?? null) === identity, [])
  useEffect(() => {
    let request: AbortController | null = null
    let generation = 0
    const update = (next: ViewerState) => {
      if (next.confirmed) {
        // Also cover logout/login that remounted this provider. Keep the active
        // account's resume point and guest queue, clear older private playback.
        try {
          const prefix = 'gurach:playback:'
          for (const key of Object.keys(localStorage)) {
            if (key.startsWith(prefix) && key !== `${prefix}guest` && key !== `${prefix}${next.user?.id}`) localStorage.removeItem(key)
          }
        } catch { /* Optional resume storage. */ }
      }
      latest.current = next
      setState(next)
    }
    const check = () => {
      request?.abort()
      const controller = new AbortController()
      request = controller
      const version = ++generation
      update({ ...latest.current, confirmed: false })
      void fetch('/api/auth/me', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) }).then(async (response) => {
        if (response.status === 401) return null
        if (!response.ok) throw new Error('Session unavailable')
        const user: unknown = (await response.json()).user
        if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string' || !/^[a-f\d]{24}$/i.test(user.id)
          || !('username' in user) || typeof user.username !== 'string'
          || !('displayName' in user) || typeof user.displayName !== 'string'
          || !('role' in user) || (user.role !== 'user' && user.role !== 'admin')) throw new Error('Invalid session')
        return user as Viewer
      }).then((user) => {
        if (!controller.signal.aborted && generation === version) update({ user, loading: false, error: false, confirmed: true, resolved: true })
      }).catch(() => {
        // A timeout/5xx says nothing about who owns the session. Preserve identity
        // and playback, but prohibit new private operations until a successful check.
        if (!controller.signal.aborted && generation === version) update({ ...latest.current, loading: false, error: true, confirmed: false })
      })
    }
    refreshRef.current = check
    check()
    window.addEventListener('focus', check)
    window.addEventListener('online', check)
    return () => { generation++; request?.abort(); refreshRef.current = () => {}; window.removeEventListener('focus', check); window.removeEventListener('online', check) }
  }, [])
  // Only a confirmed logout/account change clears all previous private component
  // state and disposes pending requests. Temporary failures keep this key stable.
  return <ViewerContext.Provider key={state.user?.id ?? 'guest'} value={{ ...state, isConfirmed, refresh }}>{children}</ViewerContext.Provider>
}
