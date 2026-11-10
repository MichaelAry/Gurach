'use client'

import { useListenCount } from './ListenCountsProvider'
import { formatListens } from '../utils/formatListens'

export function ListenCount({
  trackId,
  value,
}: {
  trackId: string
  value: number
}) {
  return <>{formatListens(useListenCount(trackId, value))}</>
}
