'use client'

import { useEffect, useState } from 'react'
import { getAccountData } from './api'

export function useAccountData<T>(path: string, revision: number) {
  const [attempt, setAttempt] = useState(0)
  const key = `${path}:${revision}:${attempt}`
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({ key: '', data: null, error: null })

  useEffect(() => {
    const controller = new AbortController()
    void getAccountData<T>(path, controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ key, data, error: null })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState((old) => ({ ...old, key, error: error instanceof Error ? error.message : 'Не удалось загрузить данные.' }))
    })
    return () => controller.abort()
  }, [path, key])

  return { data: state.data, version: state.key, pending: state.key !== key, error: state.key === key ? state.error : null, retry: () => setAttempt((old) => old + 1) }
}
