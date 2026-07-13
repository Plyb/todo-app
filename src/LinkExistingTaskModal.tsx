import { useState } from 'react'
import type { Task } from './db'
import { theme } from './theme'

type LinkExistingTaskModalProps = {
  currentTaskId: number
  allTasks: Task[]
  excludedTaskIds: Set<number>
  title?: string
  onClose: () => void
  onSelect: (task: Task) => void
}

export function LinkExistingTaskModal({ currentTaskId, allTasks, excludedTaskIds, title = 'Link Existing Task', onClose, onSelect }: LinkExistingTaskModalProps) {
  const [query, setQuery] = useState('')

  const autoArchiveSlug = localStorage.getItem('auto-archive-status-slug')
  const candidates = allTasks.filter((t) => t.id !== currentTaskId && !excludedTaskIds.has(t.id) && t.statusSlug !== autoArchiveSlug)
  const filtered = candidates.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: theme.colors.overlay,
        zIndex: theme.zIndex.modal,
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
          padding: theme.space.md,
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: theme.fontSizes.xl }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: theme.fontSizes.xxl, cursor: 'pointer' }}>
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
            fontSize: theme.fontSizes.lg,
            border: '1px solid #ddd',
            borderRadius: theme.radii.lg,
            marginBottom: 12,
            boxSizing: 'border-box',
          }}
        />
        {filtered.length === 0 ? (
          <div style={{ color: theme.colors.textDisabled, textAlign: 'center', padding: '16px 0' }}>No tasks found</div>
        ) : (
          filtered.map((task) => (
            <div
              key={task.id}
              onClick={() => onSelect(task)}
              style={{
                padding: '10px 0',
                borderBottom: `1px solid ${theme.colors.divider}`,
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
