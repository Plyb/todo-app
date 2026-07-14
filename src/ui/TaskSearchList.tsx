import { useState } from 'react'
import type { Task } from '../types'
import { theme } from '../theme'

type TaskSearchListProps = {
  tasks: Task[]
  onSelect: (task: Task) => void
}

export function TaskSearchList({ tasks, onSelect }: TaskSearchListProps) {
  const [query, setQuery] = useState('')

  const filtered = tasks.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <>
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
    </>
  )
}
