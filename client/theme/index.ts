// theme/index.ts
import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'dark', // для музыкального плеера тёмная тема логичнее
    primary: {
      main: '#7c4dff',
    },
    secondary: {
      main: '#00e5ff',
    },
    background: {
      default: '#0e0e12',
      paper: '#18181f',
    },
    text: {
      primary: '#f5f5f7',
      secondary: '#9a9aa5',
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif',
  },
})
