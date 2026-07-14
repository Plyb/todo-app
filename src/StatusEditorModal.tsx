import { useEffect, useState } from 'react'
import { type Status } from './types'
import { theme } from './theme'
import { Modal } from './ui/Modal'

export type StatusEditorModalProps = {
  status: Status
  onSave: (status: Status) => void
  onClose: () => void
}

export function StatusEditorModal({ status, onSave, onClose }: StatusEditorModalProps) {
  const [name, setName] = useState(status.name)
  const [slug, setSlug] = useState(status.slug)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const canSave = name.trim() !== '' && slug.trim() !== ''

  return (
    <Modal
      onClose={onClose}
      variant="editorModal"
      cardStyle={{ padding: 24, minWidth: 300, maxWidth: 400, width: '80%', maxHeight: '80vh', overflowY: 'auto' }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 16 }}>Edit Status</h3>
      <label style={{ display: 'block', marginBottom: 16 }}>
        <span style={{ fontSize: theme.fontSizes.md, color: '#555' }}>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            marginTop: 4,
            boxSizing: 'border-box',
            padding: '8px 10px',
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.md,
            fontSize: theme.fontSizes.lg,
          }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 16 }}>
        <span style={{ fontSize: theme.fontSizes.md, color: '#555' }}>Slug</span>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            marginTop: 4,
            boxSizing: 'border-box',
            padding: '8px 10px',
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.md,
            fontSize: theme.fontSizes.lg,
          }}
        />
      </label>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: theme.space.sm, marginTop: 20 }}>
        <button
          onClick={onClose}
          style={{ padding: '8px 16px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.md, cursor: 'pointer', background: 'none' }}
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ slug: slug.trim(), name: name.trim() })}
          disabled={!canSave}
          style={{
            padding: '8px 16px',
            background: theme.colors.brand,
            color: '#fff',
            border: 'none',
            borderRadius: theme.radii.md,
            cursor: canSave ? 'pointer' : 'default',
            opacity: canSave ? 1 : 0.5,
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  )
}
