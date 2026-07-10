import { useState } from 'react'
import type { Task } from './tasks'

type LinkExistingTaskModalProps = {
  currentTaskId: number
  allTasks: Task[]
  excludedTaskIds: Set<number>
  onClose: () => void
  onSelect: (task: Task) => void
}

export function LinkExistingTaskModal({ currentTaskId, allTasks, excludedTaskIds, onClose, onSelect }: LinkExistingTaskModalProps) {
  const [query, setQuery] = useState('')

  const candidates = allTasks.filter((t) => t.id !== currentTaskId && !excludedTaskIds.has(t.id))
  const filtered = candidates.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          backgroundColor: '#fff',
          borderRadius: '12px 12px 0 0',
          padding: 16,
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Link Existing Task</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>
            ✕
          </button>
        </div>
        <input
          autoFocus
          type="text"
          placeholder="Search tasks..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: 15,
            border: '1px solid #ddd',
            borderRadius: 8,
            marginBottom: 12,
            boxSizing: 'border-box',
          }}
        />
        {filtered.length === 0 ? (
          <div style={{ color: '#aaa', textAlign: 'center', padding: '16px 0' }}>No tasks found</div>
        ) : (
          filtered.map((task) => (
            <div
              key={task.id}
              onClick={() => onSelect(task)}
              style={{
                padding: '10px 0',
                borderBottom: '1px solid #eee',
                cursor: 'pointer',
              }}
            >
              {task.name}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
