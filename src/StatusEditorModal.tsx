import { useEffect, useState } from 'react'
import { type Status } from './db'

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
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 12,
          padding: 24,
          minWidth: 300,
          maxWidth: 400,
          width: '80%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Edit Status</h3>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 14, color: '#555' }}>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 4,
              boxSizing: 'border-box',
              padding: '8px 10px',
              border: '1px solid #ccc',
              borderRadius: 6,
              fontSize: 15,
            }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 14, color: '#555' }}>Slug</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 4,
              boxSizing: 'border-box',
              padding: '8px 10px',
              border: '1px solid #ccc',
              borderRadius: 6,
              fontSize: 15,
            }}
          />
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', background: 'none' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ slug: slug.trim(), name: name.trim() })}
            disabled={!canSave}
            style={{
              padding: '8px 16px',
              background: '#1a73e8',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: canSave ? 'pointer' : 'default',
              opacity: canSave ? 1 : 0.5,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
