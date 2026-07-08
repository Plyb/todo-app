import { useEffect, useRef, useState } from 'react'
import type { Task } from './tasks'

type QuickSelectPanelProps = {
  task: Task
  onClose: () => void
  onRename: (id: number, name: string) => void
  onDelete: (id: number) => void
}

export function QuickSelectPanel({ task, onClose, onRename, onDelete }: QuickSelectPanelProps) {
  const [name, setName] = useState(task.name)
  const [backdropReady, setBackdropReady] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setBackdropReady(true), 350)
    return () => clearTimeout(t)
  }, [])

  function commitRename() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== task.name) {
      onRename(task.id, trimmed)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commitRename()
      onClose()
    } else if (e.key === 'Escape') {
      setName(task.name)
      onClose()
    }
  }

  function handleBlur() {
    commitRename()
  }

  return (
    <>
      <div
        onClick={backdropReady ? onClose : undefined}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 10,
          pointerEvents: backdropReady ? 'auto' : 'none',
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#fff',
          borderRadius: '16px 16px 0 0',
          padding: 16,
          boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
          zIndex: 11,
        }}
      >
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            fontSize: 16,
            padding: '8px 4px',
            border: 'none',
            borderBottom: '2px solid #1a73e8',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {showConfirm ? (
          <div style={{ marginTop: 16 }}>
            <p style={{ margin: '0 0 12px' }}>Are you sure?</p>
            <button
              onClick={() => { onDelete(task.id); onClose() }}
              style={{ marginRight: 8, color: '#fff', background: '#d32f2f', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}
            >
              Confirm Delete
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              style={{ border: '1px solid #ccc', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            style={{ marginTop: 16, color: '#fff', background: '#d32f2f', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}
          >
            Delete
          </button>
        )}
      </div>
    </>
  )
}
