import { useEffect, useRef, useState } from 'react'
import type { Task, Status, Relationship } from './tasks'
import { loadRelationships } from './tasks'
import { StatusModal } from './StatusModal'
import { RelationshipModal, RelationshipGroup } from './RelationshipModal'

type QuickSelectPanelProps = {
  task: Task
  statuses: Status[]
  recentStatusSlugs: string[]
  allTasks: Task[]
  onClose: () => void
  onRename: (id: number, name: string) => void
  onChangeStatus: (id: number, statusSlug: string) => void
  onDelete: (id: number) => void
  onUpdateNotes: (id: number, notes: string) => void
  onOpenTask: (id: number) => void
  onDoneChange: (id: number, done: boolean) => void
}

export function QuickSelectPanel({ task, statuses, recentStatusSlugs, allTasks, onClose, onRename, onChangeStatus, onDelete, onUpdateNotes, onOpenTask, onDoneChange }: QuickSelectPanelProps) {
  const [name, setName] = useState(task.name)
  const [showModal, setShowModal] = useState(false)
  const [backdropReady, setBackdropReady] = useState(false)
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [notes, setNotes] = useState(task.notes)
  const [expanded, setExpanded] = useState(false)
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setExpanded(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    loadRelationships(task.id).then(setRelationships)
  }, [task.id])

  useEffect(() => {
    const t = setTimeout(() => setBackdropReady(true), 350)
    return () => clearTimeout(t)
  }, [])

  const currentStatus = statuses.find((s) => s.slug === task.statusSlug)

  function handleClose() {
    setExpanded(false)
    setTimeout(onClose, 200)
  }

  function commitRename() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== task.name) onRename(task.id, trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { commitRename(); handleClose() }
    else if (e.key === 'Escape') { setName(task.name); handleClose() }
  }

  function handleBlur() { commitRename() }

  const taskById = new Map(allTasks.map((t) => [t.id, t]))

  const parentTasks = relationships
    .filter((r) => r.type === 'parent-of' && r.toTaskId === task.id)
    .map((r) => taskById.get(r.fromTaskId))
    .filter((t): t is Task => t !== undefined)
    .slice(0, 1)

  const subtasks = relationships
    .filter((r) => r.type === 'parent-of' && r.fromTaskId === task.id)
    .map((r) => taskById.get(r.toTaskId))
    .filter((t): t is Task => t !== undefined)

  const relatedGroups: Array<{ label: string; tasks: Task[] }> = [
    ...(parentTasks.length > 0 ? [{ label: 'Parent', tasks: parentTasks }] : []),
    ...(subtasks.length > 0 ? [{ label: 'Subtasks', tasks: subtasks }] : []),
  ]

  function handleNotesBlur() {
    if (notes !== task.notes) {
      onUpdateNotes(task.id, notes)
    }
  }

  return (
    <>
      <div onClick={backdropReady ? handleClose : undefined} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 10, pointerEvents: backdropReady ? 'auto' : 'none' }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          padding: 16,
          zIndex: 11,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #eee', margin: '-16px -16px 0' }}>
          <input type="checkbox" checked={task.done} onChange={(e) => onDoneChange(task.id, e.target.checked)} />
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              fontSize: 16,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: task.done ? '#aaa' : undefined,
            }}
          />
        </div>

        <div style={{
          overflow: 'hidden',
          maxHeight: expanded ? '1000px' : '0',
          transition: 'max-height 0.2s ease',
        }}>
          <label style={{ display: 'block', fontSize: 14, color: '#555', marginTop: 12, marginBottom: 4 }}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            style={{
              width: '100%',
              minHeight: 80,
              boxSizing: 'border-box',
              fontSize: 15,
              padding: '8px 10px',
              border: '1px solid #ccc',
              borderRadius: 6,
              resize: 'vertical',
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

          {showConfirm ? (
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 12px' }}>Are you sure?</p>
              <button
                onClick={() => { onDelete(task.id); handleClose() }}
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

      {showModal && (
        <RelationshipModal
          currentTaskId={task.id}
          allTasks={allTasks}
          onClose={() => setShowModal(false)}
          onRelationshipAdded={() => loadRelationships(task.id).then(setRelationships)}
        />
      )}
    </>
  )
}
