import { useEffect, useRef, useState } from 'react'
import type { Task } from './tasks'
import { RelationshipModal, RelationshipGroup } from './RelationshipModal'

type QuickSelectPanelProps = {
  task: Task
  allTasks: Task[]
  onClose: () => void
  onRename: (id: number, name: string) => void
  onDelete: (id: number) => void
  onOpenTask: (id: number) => void
}

export function QuickSelectPanel({ task, allTasks, onClose, onRename, onDelete, onOpenTask }: QuickSelectPanelProps) {
  const [name, setName] = useState(task.name)
  const [showModal, setShowModal] = useState(false)
  const [backdropReady, setBackdropReady] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const t = setTimeout(() => setBackdropReady(true), 350)
    return () => clearTimeout(t)
  }, [])

  function commitRename() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== task.name) onRename(task.id, trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { commitRename(); onClose() }
    else if (e.key === 'Escape') { setName(task.name); onClose() }
  }

  function handleBlur() { commitRename() }

  // Placeholder: no related tasks yet
  const relatedGroups: Array<{ label: string; tasks: Task[] }> = []

  return (
    <>
      <div onClick={backdropReady ? onClose : undefined} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 10, pointerEvents: backdropReady ? 'auto' : 'none' }} />
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
          maxHeight: '60vh',
          overflowY: 'auto',
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
            marginBottom: 16,
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

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Related Tasks</div>

          {relatedGroups.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 14, marginBottom: 12 }}>No related tasks</div>
          ) : (
            relatedGroups.map((group) => (
              <RelationshipGroup
                key={group.label}
                label={group.label}
                tasks={group.tasks}
                onOpenTask={onOpenTask}
              />
            ))
          )}

          <button
            onClick={() => setShowModal(true)}
            style={{
              marginTop: 4,
              padding: '8px 16px',
              backgroundColor: '#1a73e8',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Add Relationship
          </button>
        </div>
      </div>

      {showModal && (
        <RelationshipModal
          currentTaskId={task.id}
          allTasks={allTasks}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
