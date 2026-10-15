// app/(main)/tracks/[id]/loading.tsx
import { Box, Card, Skeleton, Stack } from '@mui/material'

export default function Loading() {
  return (
    <Box sx={{ px: 3, pb: 2 }}>
      <Card sx={{ p: 2, maxWidth: 680 }}>
        <Stack direction="column" spacing={3}>
          <Skeleton variant="rounded" height={200} sx={{ my: 2 }} />
          <Skeleton variant="text" width="60%" height={48} />
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="30%" />
          <Skeleton variant="rounded" height={56} />
        </Stack>
      </Card>
    </Box>
  )
}
