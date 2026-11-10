'use client'
import { Alert, Button, Skeleton, Stack } from '@mui/material'
export function BlockState({
  loading,
  error,
  retry,
}: {
  loading: boolean
  error: boolean
  retry: () => void
}) {
  return loading ? (
    <Stack spacing={1}>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rounded" height={52} />
      ))}
    </Stack>
  ) : error ? (
    <Alert
      severity="warning"
      action={<Button onClick={retry}>Повторить</Button>}
    >
      Не удалось загрузить блок.
    </Alert>
  ) : null
}
