'use client'
import { useLocale } from '@/i18n/LocaleProvider'

import { useListenCount } from './ListenCountsProvider'
import { formatListens } from '../utils/formatListens'

export function ListenCount({
  trackId,
  value,
}: {
  trackId: string
  value: number
}) {
  const { locale } = useLocale()
  return <>{formatListens(useListenCount(trackId, value), locale)}</>
}
