'use client'

import { useText } from './LocaleProvider'
import type { UiKey, Values } from './messages'

export function LocalizedText({ messageKey, values }: { messageKey: UiKey; values?: Values }) {
  const text = useText()
  return text(messageKey, values)
}
