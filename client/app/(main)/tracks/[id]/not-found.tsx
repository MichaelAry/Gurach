// app/(main)/tracks/[id]/not-found.tsx
import Link from 'next/link'
import { Box, Button, Stack, Typography } from '@mui/material'

export default function NotFound() {
  return (
    <Box sx={{ px: 3, py: 6 }}>
      <Stack spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          Трек не найден
        </Typography>
        <Typography color="text.secondary">
          Возможно, он был удалён или ссылка неверна.
        </Typography>
        <Link href="/tracks" passHref legacyBehavior>
          <Button variant="outlined" component="a">
            К списку треков
          </Button>
        </Link>
      </Stack>
    </Box>
  )
}