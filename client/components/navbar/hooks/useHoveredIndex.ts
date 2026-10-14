'use client'

import { useCallback, useState } from 'react'

export function useHoveredIndex() {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const onEnter = useCallback((idx: number) => setHoveredIdx(idx), [])
  const onLeave = useCallback(() => setHoveredIdx(null), [])

  return { hoveredIdx, onEnter, onLeave }
}
