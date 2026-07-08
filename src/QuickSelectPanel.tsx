import { useEffect, useRef, useState } from 'react'
import type { Task, Status } from './tasks'
import { StatusModal } from './StatusModal'

type QuickSelectPanelProps = {
  task: Task
  statuses: Status[]
  recentStatusSlugs: string[]
  onClose: () => void
  onRename: (id: number, name: string) => void
  onChangeStatus: (id: number, statusSlug: string) => void
}

export function QuickSelectPanel({ task, statuses, recentStatusSlugs, onClose, onRename, onChangeStatus }: QuickSelectPanelProps) {
  const [name, setName] = useState(task.name)
  const [backdropReady, setBackdropReady] = useState(false)
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const t = setTimeout(() => setBackdropReady(true), 350)
    return () => clearTimeout(t)
  }, [])

  const currentStatus = statuses.find((s) => s.slug === task.statusSlug)

  function commitRename() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== task.name) onRename(task.id, trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { commitRename(); onClose() }
    else if (e.key === 'Escape') { setName(task.name); onClose() }
  }

  function handleBlur() { commitRename() }  // no onClose() here

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ color: '#666', fontSize: 14 }}>Status:</span>
          <button
            onClick={() => setStatusModalOpen(true)}
            style={{
              background: '#e8f0fe',
              border: 'none',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: 14,
              color: '#1a73e8',
              fontWeight: 500,
            }}
          >
            {currentStatus?.name ?? task.statusSlug}
          </button>
        </div>
      </div>

      {statusModalOpen && (
        <StatusModal
          statuses={statuses}
          recentStatusSlugs={recentStatusSlugs}
          currentStatusSlug={task.statusSlug}
          onSelect={(slug) => onChangeStatus(task.id, slug)}
          onClose={() => setStatusModalOpen(false)}
        />
      )}
    </>
  )
}
