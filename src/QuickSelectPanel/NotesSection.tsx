import { useState } from 'react'
import type { Task } from '../types'
import { theme } from '../theme'

type NotesSectionProps = {
  task: Task
  onUpdateNotes: (id: number, notes: string) => void
}

export function NotesSection({ task, onUpdateNotes }: NotesSectionProps) {
  const [notes, setNotes] = useState(task.notes)

  function handleBlur() {
    if (notes !== task.notes) {
      onUpdateNotes(task.id, notes)
    }
  }

  return (
    <>
      <label style={{ display: 'block', fontSize: theme.fontSizes.md, color: '#555', marginTop: 12, marginBottom: 4 }}>
        Notes
      </label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleBlur}
        style={{
          width: '100%',
          minHeight: 80,
          boxSizing: 'border-box',
          fontSize: theme.fontSizes.lg,
          padding: '8px 10px',
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.md,
          resize: 'vertical',
        }}
      />
    </>
  )
}
