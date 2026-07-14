import { useState } from 'react'
import type { Task } from './types'
import { theme } from './theme'
import { BottomSheet } from './ui/Modal'
import { CloseButton } from './ui/CloseButton'
import { selectableTasks } from './storage'

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

  const candidates = selectableTasks(allTasks, { currentTaskId, excludedIds: excludedTaskIds })
  const filtered = candidates.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <BottomSheet onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: theme.fontSizes.xl }}>{title}</span>
        <CloseButton onClick={onClose} />
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
    </BottomSheet>
  )
}
