'use client'
import { useEffect, useState } from 'react'
import { useViewer } from '@/features/auth/ViewerProvider'

export function useHomeBlock<T>(path: string, revision: string | number = 0) {
  const viewer = useViewer()
  const { isConfirmed } = viewer
  const identity = viewer.user?.id ?? null
  const privateBlock = path.startsWith('/api/account/') || path === '/api/home/discovery'
  const enabled = !privateBlock || (identity !== null && viewer.confirmed)
  const [attempt, setAttempt] = useState(0)
  const key = `${path}:${identity}:${revision}:${attempt}:${enabled}`
  const [state, setState] = useState<{
    key: string
    data: T | null
    error: boolean
    loading: boolean
  }>({ key: '', data: null, error: false, loading: true })
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch(path, { signal: controller.signal, cache: 'no-store' })
      .then(async (r): Promise<T> => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data) => {
        if (!controller.signal.aborted && (!privateBlock || isConfirmed(identity)))
          setState({ key, data, error: false, loading: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, data: null, error: true, loading: false })
      })
    return () => controller.abort()
  }, [path, key, identity, enabled, privateBlock, isConfirmed])
  const current = state.key === key ? state : { data: null, error: false, loading: enabled }
  return {
    data: current.data,
    error: current.error,
    loading: current.loading,
    retry: () => setAttempt((a) => a + 1),
  }
}
