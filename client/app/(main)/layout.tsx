import Navbar from '@/components/navbar'
import { BackButton } from '@/features/navigation/components/BackButton'
import { Box } from '@mui/material'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 1,
          p: 1,
          perspective: '800px',
          transformStyle: 'preserve-3d',
          userSelect: 'none',
        }}
      >
        <BackButton />

        <Navbar />
      </Box>

      <main>{children}</main>
    </>
  )
}
