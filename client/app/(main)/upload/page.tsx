import { Box, Button, Typography } from '@mui/material'

export default function UploadPage() {
  return (
    <Box sx={{ p: 3, maxWidth: 600, width: '100%', mx: 'auto' }}>
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
          color: 'text.primary',
        }}
      />

      <Button
        variant="contained"
        sx={{
          mb: 2,
          width: '100%',
        }}
      >
        Upload
      </Button>

      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Supports MP3, WAV, OGG, M4A files
      </Typography>
    </Box>
  )
}
