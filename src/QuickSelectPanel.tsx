import { useEffect, useRef, useState } from 'react'
import type { Task, Status, Subtask } from './tasks'
import { loadSubtasks, createSubtask, updateSubtaskDone, updateSubtaskRank } from './tasks'
import { StatusModal } from './StatusModal'
import { DraggableList } from './DraggableList'
import { rankBetween } from './rank-utils'

type QuickSelectPanelProps = {
  task: Task
  statuses: Status[]
  recentStatusSlugs: string[]
  onClose: () => void
  onRename: (id: number, name: string) => void
  onChangeStatus: (id: number, statusSlug: string) => void
  onDelete: (id: number) => void
  onUpdateNotes: (id: number, notes: string) => void
  onDoneChange: (id: number, done: boolean) => void
}

export function QuickSelectPanel({ task, statuses, recentStatusSlugs, onClose, onRename, onChangeStatus, onDelete, onUpdateNotes, onDoneChange }: QuickSelectPanelProps) {
  const [name, setName] = useState(task.name)
  const [backdropReady, setBackdropReady] = useState(false)
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [notes, setNotes] = useState(task.notes)
  const [expanded, setExpanded] = useState(false)
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [newSubtaskName, setNewSubtaskName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setExpanded(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setBackdropReady(true), 350)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    loadSubtasks(task.id).then(setSubtasks)
  }, [task.id])

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

  function handleNotesBlur() {
    if (notes !== task.notes) {
      onUpdateNotes(task.id, notes)
    }
  }

  async function handleAddSubtask() {
    const trimmed = newSubtaskName.trim()
    if (!trimmed) return
    const lastSubtask = subtasks[subtasks.length - 1] ?? null
    const rank = rankBetween(lastSubtask, null)
    const subtask = await createSubtask(task.id, trimmed, rank)
    setSubtasks((prev) => [...prev, subtask])
    setNewSubtaskName('')
  }

  function handleSubtaskDoneChange(id: number, done: boolean) {
    updateSubtaskDone(id, done)
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, done } : s)))
  }

  function handleSubtaskReorder(draggedId: number, insertIndex: number) {
    const others = subtasks.filter((s) => s.id !== draggedId)
    const prev = insertIndex > 0 ? others[insertIndex - 1] : null
    const next = insertIndex < others.length ? others[insertIndex] : null
    const rank = rankBetween(prev, next)
    updateSubtaskRank(draggedId, rank)
    const dragged = subtasks.find((s) => s.id === draggedId)!
    const updated = { ...dragged, rank }
    const reordered = [...others]
    reordered.splice(insertIndex, 0, updated)
    setSubtasks(reordered)
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
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Subtasks</div>

            {subtasks.length > 0 && (
              <DraggableList
                items={subtasks}
                onReorder={handleSubtaskReorder}
                renderItem={(subtask) => (
                  <>
                    <input
                      type="checkbox"
                      checked={subtask.done}
                      onChange={(e) => handleSubtaskDoneChange(subtask.id, e.target.checked)}
                    />
                    <span style={{ marginLeft: 8, color: subtask.done ? '#aaa' : undefined }}>
                      {subtask.name}
                    </span>
                  </>
                )}
              />
            )}

            <input
              type="text"
              placeholder="Add subtask..."
              value={newSubtaskName}
              onChange={(e) => setNewSubtaskName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { handleAddSubtask() } }}
              onBlur={handleAddSubtask}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 14,
                border: '1px solid #ddd',
                borderRadius: 6,
                marginTop: subtasks.length > 0 ? 8 : 0,
                boxSizing: 'border-box',
              }}
            />
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
    </>
  )
}
