import React from 'react'
import { theme } from './theme'

type NewTaskInputFieldProps = {
  sectionIndex: number
  insertIndex: number
  onBlur: (e: React.FocusEvent<HTMLInputElement>, sectionIndex: number, insertIndex: number) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, sectionIndex: number, insertIndex: number) => void
}

export function NewTaskInputField({ sectionIndex, insertIndex, onBlur, onKeyDown }: NewTaskInputFieldProps) {
  function autoFocusOnAppearance(el: HTMLInputElement | null) {
    el?.focus()
  }

  return (
    <input
      ref={autoFocusOnAppearance}
      type="text"
      placeholder="Task name"
      onBlur={(e) => onBlur(e, sectionIndex, insertIndex)}
      onKeyDown={(e) => onKeyDown(e, sectionIndex, insertIndex)}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 12px',
        fontSize: theme.fontSizes.xl,
        border: `2px solid ${theme.colors.brand}`,
        borderRadius: theme.radii.md,
        outline: 'none',
        margin: '4px 0',
      }}
    />
  )
}
