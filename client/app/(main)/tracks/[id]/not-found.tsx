// app/(main)/tracks/[id]/not-found.tsx
import { Box, Button, Stack, Typography } from '@mui/material'
import Link from 'next/link'

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
        {/* Link-обёртка вместо component={Link}: not-found — серверный компонент,
            а function-проп клиентскому Button передавать нельзя
            ("Functions cannot be passed directly to Client Components") */}
        <Link href="/tracks" style={{ textDecoration: 'none' }}>
          <Button variant="outlined">К списку треков</Button>
        </Link>
      </Stack>
    </Box>
  )
}
