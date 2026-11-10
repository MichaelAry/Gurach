'use client'

import { Box, Button, Stack, Typography } from '@mui/material'

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const requestReference = /\[((?:VALIDATION_ERROR|NOT_FOUND|CONFLICT|PAYLOAD_TOO_LARGE|UNSUPPORTED_MEDIA_TYPE|UNAUTHORIZED|FORBIDDEN|RATE_LIMITED|INTERNAL_ERROR|BACKEND_UNAVAILABLE|BACKEND_TIMEOUT)); request ([A-Za-z0-9._:-]{1,128})\]$/.exec(error.message)

  return (
    <Box sx={{ p: 3 }} role="alert">
      <Stack spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1">
          Не удалось загрузить данные
        </Typography>
        <Typography color="text.secondary">
          Попробуйте ещё раз через некоторое время.
        </Typography>
        {requestReference && (
          <Typography color="text.secondary" variant="caption">
            Код: {requestReference[1]}; ID запроса: {requestReference[2]}
          </Typography>
        )}
        <Button variant="outlined" onClick={reset}>
          Повторить
        </Button>
      </Stack>
    </Box>
  )
}
