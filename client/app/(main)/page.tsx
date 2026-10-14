import { Box, Typography } from '@mui/material'

export default function HomePage() {
  return (
    <Box
      sx={{
        mt: '50px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Typography variant="h1">Welcome</Typography>
      <Typography variant="h1">to Gurach</Typography>
    </Box>
  )
}
