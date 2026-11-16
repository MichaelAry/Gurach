'use client'
import { Alert, Button, Stack, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import { useLocale, useTranslations, useText } from '@/i18n/LocaleProvider'

export function LanguageSwitcher() {
  const { locale, setLocale, syncError, syncPending, retrySync } = useLocale()
  const t = useTranslations('navigation')
  const lt = useText()
  return (
    <Stack spacing={1} sx={{ maxWidth: 340 }}>
    <Tooltip title={t('language')}>
      <ToggleButtonGroup size="small" exclusive value={locale} onChange={(_, value: 'en' | 'ru' | null) => { if (value) setLocale(value) }} aria-label={t('language')}>
        <ToggleButton value="en" aria-label="English">EN</ToggleButton>
        <ToggleButton value="ru" aria-label="Русский">RU</ToggleButton>
      </ToggleButtonGroup>
    </Tooltip>
    {syncError && <Alert severity="warning" action={<Button disabled={syncPending} onClick={retrySync}>{lt('tryAgain')}</Button>}>{lt('languageSyncFailed')}</Alert>}
    </Stack>
  )
}
