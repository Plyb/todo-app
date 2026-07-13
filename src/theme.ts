// Design tokens shared across components. These are extracted from literals
// that were previously copy-pasted inline across ~13 files; values here must
// stay byte-for-byte identical to what they replace (pixel-identical output).

export const colors = {
  brand: '#1a73e8',
  selected: '#e8f0fe',
  danger: '#d32f2f',
  greyDark: '#888',
  greyMedium: '#999',
  greyLight: '#aaa',
  overlay: 'rgba(0,0,0,0.5)',
  border: '#ccc',
  divider: '#eee',
} as const

export const space = {
  sm: 8,
  md: 16,
} as const

export const radii = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
} as const

export const fontSizes = {
  xs: 12,
  sm: 13,
  md: 14,
  lg: 15,
  xl: 16,
  xxl: 18,
} as const

export const shadows = {
  modal: '0 8px 32px rgba(0,0,0,0.2)',
} as const

export const zIndex = {
  panel: 10,
  panelBackdrop: 11,
  modal: 200,
  editorModal: 300,
} as const

export const theme = {
  colors,
  space,
  radii,
  fontSizes,
  shadows,
  zIndex,
} as const

export type Theme = typeof theme

export default theme
