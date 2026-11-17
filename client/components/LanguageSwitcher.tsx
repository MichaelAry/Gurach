'use client'
import { useSyncExternalStore } from 'react'
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import { useLocale, useTranslations } from '@/i18n/LocaleProvider'

const subscribe = () => () => {}
const ready = () => true
const serverReady = () => false

export function LanguageSwitcher() {
  const interactive = useSyncExternalStore(subscribe, ready, serverReady)
  const { locale, setLocale } = useLocale()
  const t = useTranslations('navigation')
  return (
    <Tooltip title={t('language')}>
      <ToggleButtonGroup disabled={!interactive} size="small" exclusive value={locale} onChange={(_, value: 'en' | 'ru' | null) => { if (value) setLocale(value) }} aria-label={t('language')}>
        <ToggleButton value="en" aria-label="English">EN</ToggleButton>
        <ToggleButton value="ru" aria-label="Русский">RU</ToggleButton>
      </ToggleButtonGroup>
    </Tooltip>
  )
}
