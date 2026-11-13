'use client'
import { useEffect, useState } from 'react'
export function useHomeBlock<T>(path: string) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{
    data: T | null
    error: boolean
    loading: boolean
  }>({ data: null, error: false, loading: true })
  useEffect(() => {
    const controller = new AbortController()
    fetch(path, { signal: controller.signal, cache: 'no-store' })
      .then(async (r): Promise<T> => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ data, error: false, loading: false })
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ data: null, error: true, loading: false })
      })
    return () => controller.abort()
  }, [path, attempt])
  return {
    ...state,
    retry: () => {
      setState({ data: null, error: false, loading: true })
      setAttempt((a) => a + 1)
    },
  }
}
