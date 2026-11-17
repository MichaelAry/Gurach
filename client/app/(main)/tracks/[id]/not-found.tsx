import { LocalizedText } from '@/i18n/LocalizedText'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'
// app/(main)/tracks/[id]/not-found.tsx
import { Box, Button, Stack, Typography } from '@mui/material'
import Link from 'next/link'

export default function NotFound() {
  return (
    <Box sx={{ px: 3, py: 6 }}>
      <LocaleMetadata title={{ key: 'trackNotFound' }} />
      <Stack spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          <LocalizedText messageKey="trackNotFound" /></Typography>
        <Typography color="text.secondary">
          <LocalizedText messageKey="itMayHaveBeenDeletedOrTheLinkMay" /></Typography>
        {/* Link-обёртка вместо component={Link}: not-found — серверный компонент,
            а function-проп клиентскому Button передавать нельзя
            ("Functions cannot be passed directly to Client Components") */}
        <Link href="/tracks" style={{ textDecoration: 'none' }}>
          <Button variant="outlined"><LocalizedText messageKey="backToTracks" /></Button>
        </Link>
      </Stack>
    </Box>
  )
}
