// Shared source for MUI and CSS variables emitted by CssBaseline.
export const colors = {
 page: '#E8E7E1', surface: '#F0EFE9', surfaceMuted: '#DFDED7', surfaceHover: '#D7D6CE', surfaceSelected: '#CECDC4',
 text: '#292A28', textSecondary: '#62635F', textSecondaryStrong: '#555650', textDisabled: '#CECDC6',
 action: '#343530', actionHover: '#292A28', onAction: '#F0EFE9', divider: '#D8D7D0', border: '#CECDC6',
 controlBorder: '#777873', focus: '#555650', accent: '#986049', accentText: '#8A523D', warmLight: '#BDA17C',
 activeSurface: '#E7DACE',
} as const
export const shadows = { floating: '0 12px 40px #292a2824', artwork: '8px 12px 26px #242c2228' }
export const typeRoles = {
 page: { fontSize: { xs: 28, sm: 32, md: 40 }, fontWeight: 500, lineHeight: 1.1, letterSpacing: '-.03em', overflowWrap: 'anywhere' },
 hero: { fontSize: { xs: 40, sm: 56, md: 72 }, fontWeight: 500, lineHeight: 1.04, letterSpacing: '-.04em', overflowWrap: 'anywhere' },
 section: { fontSize: { xs: 24, sm: 28, md: 32 }, fontWeight: 500, lineHeight: 1.2, letterSpacing: '-.02em' },
 auth: { fontSize: { xs: 32, sm: 36, md: 40 }, fontWeight: 500, lineHeight: 1.12, letterSpacing: '-.03em' },
} as const

export const radii = { artwork: 3, control: 8, panel: 12 } as const

export const density = {
 pageTop: { xs: 2, md: 3 }, headerGap: { xs: 2, md: 3 },
 rowPaddingY: 1, rowMinHeight: 72,
} as const

// A persistent edge identifies selection even when color is unavailable.
export const activeItemStyles = {
 bgcolor: 'var(--wae-activeSurface)', boxShadow: 'inset 3px 0 0 var(--wae-accent)',
 '&:hover': { bgcolor: 'var(--wae-activeSurface)' },
} as const
