'use client'
import { Alert, Stack } from '@mui/material'
import { useMessage } from '@/i18n/LocaleProvider'

export function ActionFeedback({ error, success }: { error?: string | null; success?: string | null }) {
  const resolve = useMessage()
  if (!error && !success) return null
  return <Stack spacing={1}>
    {error && <Alert severity="error" role="alert">{resolve(error)}</Alert>}
    {!error && success && <Alert severity="success" role="status">{resolve(success)}</Alert>}
  </Stack>
}
