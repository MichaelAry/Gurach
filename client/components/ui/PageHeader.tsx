import type { ReactNode } from 'react'
import { Box, Typography } from '@mui/material'
import { density, typeRoles } from '@/theme/tokens'
export function PageHeader({ title, description, actions, eyebrow, hero = false }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; hero?: boolean }) {
 return <Box component="header" sx={{ mb: hero ? { xs: 3, md: 5 } : density.headerGap, minWidth: 0 }}>
  {eyebrow && <Typography variant="overline" color="text.secondary">{eyebrow}</Typography>}
  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
   <Typography component="h1" sx={hero ? typeRoles.hero : typeRoles.page}>{title}</Typography>
   {actions && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{actions}</Box>}
  </Box>
  {description && <Typography color="text.secondary" sx={{ mt: hero ? 2 : 1, maxWidth: '70ch' }}>{description}</Typography>}
 </Box>
}
