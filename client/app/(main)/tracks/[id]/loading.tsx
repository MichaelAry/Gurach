import { Box, Skeleton, Stack } from '@mui/material'
export default function Loading() {
 return <Stack spacing={6} aria-busy="true">
  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '340px minmax(0, 1fr)' }, gap: { xs: 3, md: 8 }, alignItems: 'center' }}>
   <Skeleton variant="rectangular" sx={{ width: 'min(100%, 340px)', aspectRatio: '1', height: 'auto' }} />
   <Stack spacing={2}><Skeleton width="80%" height={80} /><Skeleton width="45%" /><Skeleton width="60%" height={52} /></Stack>
  </Box><Skeleton width="40%" height={40} /><Skeleton width="100%" height={160} />
 </Stack>
}
