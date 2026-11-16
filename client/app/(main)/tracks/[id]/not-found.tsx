import { getText } from '@/i18n/server'
// app/(main)/tracks/[id]/not-found.tsx
import { Box, Button, Stack, Typography } from '@mui/material'
import Link from 'next/link'

export default async function NotFound() {
  const lt = await getText()

  return (
    <Box sx={{ px: 3, py: 6 }}>
      <Stack spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          {lt('trackNotFound')}</Typography>
        <Typography color="text.secondary">
          {lt('itMayHaveBeenDeletedOrTheLinkMay')}</Typography>
        {/* Link-обёртка вместо component={Link}: not-found — серверный компонент,
            а function-проп клиентскому Button передавать нельзя
            ("Functions cannot be passed directly to Client Components") */}
        <Link href="/tracks" style={{ textDecoration: 'none' }}>
          <Button variant="outlined">{lt('backToTracks')}</Button>
        </Link>
      </Stack>
    </Box>
  )
}
