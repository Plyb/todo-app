import type { CSSProperties } from 'react'
import { theme } from '../theme'

type CloseButtonProps = {
  onClick: () => void
  style?: CSSProperties
}

export function CloseButton({ onClick, style }: CloseButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: theme.fontSizes.xxl, lineHeight: 1, padding: 4, ...style }}
      aria-label="Close"
    >
      ✕
    </button>
  )
}
