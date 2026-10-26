// theme/index.ts
import { createTheme } from '@mui/material/styles'

/**
 * Монохромная СВЕТЛАЯ тема.
 *
 * Вся палитра построена на одной шкале «холодного графита» — от почти-белого
 * (25) до почти-чёрного (900). Никаких чистых #000 / #fff и никаких других
 * оттенков — поэтому это именно монохром, а не «чб».
 *
 * Если захочется чуть другого настроения:
 *   - сделай шкалу теплее  (например, тона stone/taupe: #f7f5f2, #e8e3dc, ...)
 *   - или холоднее/синее  (slate: #f5f7fa, #dde3ec, ...)
 * Логика остальных токенов не поменяется.
 */
const mono = {
  25: '#fafbfc',
  50: '#f4f5f8',
  100: '#e8eaef',
  200: '#d5d8e0',
  300: '#b4b9c6',
  400: '#8c91a1',
  500: '#6a6f7e',
  600: '#505463',
  700: '#3c3f4b',
  800: '#2a2c36',
  900: '#1b1d24',
} as const

export const theme = createTheme({
  palette: {
    mode: 'light',

    primary: {
      main: mono[800], // графит — основной «акцент»
      light: mono[500],
      dark: mono[900],
      contrastText: mono[25],
    },
    secondary: {
      main: mono[500], // средний серый — для второстепенных элементов
      light: mono[300],
      dark: mono[700],
      contrastText: mono[25],
    },

    background: {
      default: mono[50], // светлый фон страницы
      paper: mono[25], // чуть светлее — карточки, меню, player
    },

    text: {
      primary: mono[900], // тёмный текст
      secondary: mono[500],
      disabled: mono[300],
    },

    divider: mono[200],

    action: {
      active: mono[600],
      hover: 'rgba(27, 29, 36, 0.06)',
      selected: 'rgba(27, 29, 36, 0.10)',
      disabled: mono[300],
      disabledBackground: mono[100],
      focus: 'rgba(27, 29, 36, 0.12)',
    },

    // служебные состояния — тоже в монохроме, чтобы случайный MUI-цвет
    // (оранжевый warning, красный error) не выбивался из монохромной картинки.
    // Если нужны настоящие цвета для error/success — просто верни дефолт,
    // убрав этот блок.
    success: { main: mono[700], contrastText: mono[25] },
    warning: { main: mono[600], contrastText: mono[25] },
    error: { main: mono[800], contrastText: mono[25] },
    info: { main: mono[500], contrastText: mono[25] },
  },

  shape: {
    borderRadius: 8,
  },

  typography: {
    fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif',
  },

  components: {
    // Плоские кнопки без «прыжка» регистра
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 500 },
      },
    },
    // Мягкая граница у paper — читается на светлом фоне
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: ({ theme }) => ({ borderColor: theme.palette.divider }),
      },
    },
    // AppBar в стиле «бумага», без elevation
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'transparent' },
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.palette.background.paper,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }),
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: ({ theme }) => ({
          backgroundColor: theme.palette.text.primary,
          color: theme.palette.background.paper,
          fontSize: 12,
        }),
      },
    },
  },
})
