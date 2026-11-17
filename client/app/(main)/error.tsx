'use client'
import { useText } from '@/i18n/LocaleProvider'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'

import { Box, Button, Stack, Typography } from '@mui/material'

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const lt = useText()

  const requestReference = /\[((?:VALIDATION_ERROR|NOT_FOUND|CONFLICT|PAYLOAD_TOO_LARGE|UNSUPPORTED_MEDIA_TYPE|UNAUTHORIZED|FORBIDDEN|RATE_LIMITED|INTERNAL_ERROR|BACKEND_UNAVAILABLE|BACKEND_TIMEOUT)); request ([A-Za-z0-9._:-]{1,128})\]$/.exec(error.message)

  return (
    <Box sx={{ p: 3 }} role="alert">
      <LocaleMetadata />
      <Stack spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1">
          {lt('couldNotLoadData')}</Typography>
        <Typography color="text.secondary">
          {lt('tryAgainInAMoment')}</Typography>
        {requestReference && (
          <Typography color="text.secondary" variant="caption">
            {lt('code')}{requestReference[1]}{lt('requestId')}{requestReference[2]}
          </Typography>
        )}
        <Button variant="outlined" onClick={reset}>
          {lt('tryAgain')}</Button>
      </Stack>
    </Box>
  )
}
