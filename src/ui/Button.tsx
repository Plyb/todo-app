import type { CSSProperties, ReactNode } from 'react'
import { theme } from '../theme'

type ButtonProps = {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  style?: CSSProperties
}

export function PrimaryButton({ children, onClick, type = 'button', disabled = false, style }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 16px',
        background: theme.colors.brand,
        color: '#fff',
        border: 'none',
        borderRadius: theme.radii.md,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, onClick, type = 'button', disabled = false, style }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 16px',
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.md,
        background: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  )
}
