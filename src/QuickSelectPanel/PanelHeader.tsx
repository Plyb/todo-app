import { useRef, useState } from 'react'
import type { Task } from '../types'
import { useTasks } from '../tasks-context'
import { theme } from '../theme'

type PanelHeaderProps = {
  task: Task
  onClose: () => void
}

export function PanelHeader({ task, onClose }: PanelHeaderProps) {
  const { renameTask, setDone } = useTasks()
  const [name, setName] = useState(task.name)
  const inputRef = useRef<HTMLInputElement>(null)

  function commitRename() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== task.name) renameTask(task.id, trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { commitRename(); onClose() }
    else if (e.key === 'Escape') { setName(task.name); onClose() }
  }

  function handleBlur() { commitRename() }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, padding: '12px 16px', borderBottom: `1px solid ${theme.colors.divider}`, margin: '-16px -16px 0' }}>
      <input type="checkbox" checked={task.done} onChange={(e) => setDone(task.id, e.target.checked)} />
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          fontSize: theme.fontSizes.xl,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: task.done ? theme.colors.textDisabled : undefined,
        }}
      />
    </div>
  )
}
