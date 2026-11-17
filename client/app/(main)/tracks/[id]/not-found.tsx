import { LocalizedText } from '@/i18n/LocalizedText'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'
// app/(main)/tracks/[id]/not-found.tsx
import { PageHeader } from '@/components/ui/PageHeader'
import { Box, Stack, Typography } from '@mui/material'
import Link from 'next/link'

export default function NotFound() {
  return (
    <Box sx={{ px: 3, py: 6 }}>
      <LocaleMetadata title={{ key: 'trackNotFound' }} />
      <Stack spacing={2} sx={{ alignItems: 'center' }}>
        <PageHeader title={<><LocalizedText messageKey="trackNotFound" /></>} />
        <Typography color="text.secondary">
          <LocalizedText messageKey="itMayHaveBeenDeletedOrTheLinkMay" /></Typography>
        {/* Link-обёртка вместо component={Link}: not-found — серверный компонент,
            а function-проп клиентскому Button передавать нельзя
            ("Functions cannot be passed directly to Client Components") */}
        <Link href="/tracks" style={{ textDecoration: 'none' }}>
          <Box component="span" sx={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', px: 2, border: '1px solid', borderColor: 'var(--wae-controlBorder)', color: 'text.primary', borderRadius: 'var(--wae-radius-control)' }}><LocalizedText messageKey="backToTracks" /></Box>
        </Link>
      </Stack>
    </Box>
  )
}
