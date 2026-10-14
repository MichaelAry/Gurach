import { Box, Button, Typography } from '@mui/material'

export default function UploadPage() {
  return (
    <Box sx={{ p: 3, maxWidth: 600 }}>
      <Typography variant="h1" sx={{ fontSize: '1.5rem', mb: 2 }}>
        Upload your tracks
      </Typography>

      <Box
        component="input"
        type="file"
        accept=".mp3,.wav,.ogg,.m4a"
        sx={{
          display: 'block',
          mb: 2,
          p: 1.5,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          width: '100%',
          cursor: 'pointer',
        }}
      />

      <Button
        variant="contained"
        sx={{
          bgcolor: '#000',
          color: '#fff',
          mb: 2,
          width: '100%',
          '&:hover': { bgcolor: '#222' },
        }}
      >
        Upload
      </Button>

      <Typography variant="body2" sx={{ color: '#737373' }}>
        Supports MP3, WAV, OGG, M4A files
      </Typography>
    </Box>
  )
}
