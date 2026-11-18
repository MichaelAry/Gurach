// theme/index.ts
import { createTheme } from '@mui/material/styles'
import { colors, shadows, radii } from './tokens'

// Shared warm graphite scale; CSS variables are emitted by CssBaseline.
const mono = {
  25: colors.surface, 50: colors.page, 100: colors.surfaceMuted,
  200: colors.divider, 300: colors.border, 400: colors.controlBorder,
  500: colors.textSecondary, 600: colors.textSecondaryStrong, 700: '#454640',
  800: colors.action, 900: colors.text,
} as const

const surfaces = { secondary: mono[100], hover: colors.surfaceHover, selected: colors.surfaceSelected, border: mono[300] }

export const theme = createTheme({
  palette: {
    mode: 'light',
    common: { white: mono[25], black: mono[900] },
    grey: { 50: mono[25], 100: mono[50], 200: mono[100], 300: mono[200], 400: mono[300], 500: mono[400], 600: mono[500], 700: mono[600], 800: mono[800], 900: mono[900], A100: mono[100], A200: mono[200], A400: mono[500], A700: mono[700] },

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
      hover: surfaces.hover,
      selected: surfaces.selected,
      disabled: mono[300],
      disabledBackground: mono[100],
      focus: surfaces.selected,
    },

    // Muted semantic colors preserve recognizable feedback states.
    success: { main: '#52634F', contrastText: mono[25] },
    warning: { main: '#75613D', contrastText: mono[25] },
    error: { main: '#8A514E', contrastText: mono[25] },
    info: { main: '#52636B', contrastText: mono[25] },
  },

  shape: {
    borderRadius: radii.control,
  },

  typography: {
    fontFamily: 'var(--font-onest), Arial, sans-serif',
    fontWeightLight: 400,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    // Keep the existing MUI size and line-height scale. Onest does not need
    // Roboto's tracking adjustments, especially at small Cyrillic sizes.
    allVariants: { letterSpacing: '0em' },
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.55 },
    button: { fontWeight: 600, lineHeight: 1.5 },
  },

  components: {
    MuiLinearProgress: { styleOverrides: { root: { backgroundColor: colors.surfaceMuted }, bar: { backgroundColor: colors.accent } } },
    MuiAvatar: { styleOverrides: { root: { backgroundColor: colors.surfaceSelected, color: colors.text } } },
    MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: radii.panel, margin: 16, maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100dvh - 32px)', boxShadow: shadows.floating } } },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: 28, fontWeight: 500, letterSpacing: '-.02em', lineHeight: 1.2, padding: 24, '@media(max-width:599px)': { fontSize: 24, padding: 20 } } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px', flexWrap: 'wrap', gap: 8 } } },
    MuiMenu: { styleOverrides: { paper: { borderRadius: radii.control, boxShadow: shadows.floating } } },
    MuiPopover: { styleOverrides: { paper: { boxShadow: shadows.floating } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: radii.control, overflowWrap: 'anywhere' }, message: { minWidth: 0 }, action: { flexWrap: 'wrap' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none' } } },
    MuiBackdrop: { styleOverrides: { root: { backgroundColor: 'rgba(41, 42, 40, 0.32)' } } },
    MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: mono[25], '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.controlBorder }, '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: mono[400] } } } },
    MuiTableCell: { styleOverrides: { head: { backgroundColor: surfaces.secondary, fontWeight: 600 } } },
    MuiSnackbarContent: { styleOverrides: { root: { backgroundColor: mono[800], color: mono[25], boxShadow: 'none' } } },
    MuiSlider: { styleOverrides: { thumb: { '&:hover, &.Mui-focusVisible, &.Mui-active': { boxShadow: 'none', outline: `2px solid ${mono[500]}`, outlineOffset: 3 } } } },
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        html: { fontFamily: theme.typography.fontFamily, scrollbarColor: `${mono[400]} ${mono[50]}` },
        ':root': { ...Object.fromEntries(Object.entries(mono).map(([key, value]) => [`--mono-${key}`, value])), ...Object.fromEntries(Object.entries(colors).map(([key, value]) => [`--wae-${key}`, value])), ...Object.fromEntries(Object.entries(radii).map(([key, value]) => [`--wae-radius-${key}`, `${value}px`])), ...Object.fromEntries(Object.entries(shadows).map(([key, value]) => [`--wae-shadow-${key}`, value])) },
        ':focus-visible': { outline: `2px solid ${mono[500]}`, outlineOffset: 3 },
        '::selection': { background: surfaces.selected, color: mono[900] },
        a: { color: colors.action },
        'button, input, select, textarea': { fontFamily: 'inherit' },
      }),
    },
    MuiButtonBase: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontWeight: theme.typography.fontWeightMedium,
          '&[aria-pressed="true"]:not(.Mui-disabled)': {
            backgroundColor: '#C7BDB1',
            color: colors.text,
            '&:hover': { backgroundColor: '#BBAFA1' },
            '@media (forced-colors: active)': {
              forcedColorAdjust: 'none',
              backgroundColor: 'Highlight',
              color: 'HighlightText',
            },
          },
        }),
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: ({ theme }) => ({ fontWeight: theme.typography.fontWeightMedium }),
      },
    },
    // Плоские кнопки без «прыжка» регистра
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 44, borderRadius: radii.control, textTransform: 'none', padding: '8px 16px', transition: 'background-color 160ms ease, border-color 160ms ease', '&:active': { filter: 'brightness(0.96)' } },
        outlined: { borderColor: colors.controlBorder, color: mono[900], backgroundColor: surfaces.secondary, '&:hover': { backgroundColor: surfaces.hover, borderColor: mono[400] } },
      },
    },
    // Мягкая граница у paper — читается на светлом фоне
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none', boxShadow: 'none', border: `1px solid ${mono[200]}` },
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
