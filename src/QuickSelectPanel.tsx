import { useEffect, useRef, useState } from 'react'
import type { Task } from './tasks'

type QuickSelectPanelProps = {
  task: Task
  onClose: () => void
  onRename: (id: number, name: string) => void
}

export function QuickSelectPanel({ task, onClose, onRename }: QuickSelectPanelProps) {
  const [name, setName] = useState(task.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
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
    onClose()
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 10,
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
      </div>
    </>
  )
}
