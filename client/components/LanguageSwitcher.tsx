'use client'
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import { useLocale, useTranslations } from '@/i18n/LocaleProvider'

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale()
  const t = useTranslations('navigation')
  return (
    <Tooltip title={t('language')}>
      <ToggleButtonGroup size="small" exclusive value={locale} onChange={(_, value: 'en' | 'ru' | null) => { if (value) setLocale(value) }} aria-label={t('language')}>
        <ToggleButton value="en" aria-label="English">EN</ToggleButton>
        <ToggleButton value="ru" aria-label="Русский">RU</ToggleButton>
      </ToggleButtonGroup>
    </Tooltip>
  )
}
