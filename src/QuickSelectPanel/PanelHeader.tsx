import { useRef, useState } from 'react'
import type { Task } from '../types'
import { theme } from '../theme'

type PanelHeaderProps = {
  task: Task
  onRename: (id: number, name: string) => void
  onDoneChange: (id: number, done: boolean) => void
  onClose: () => void
}

export function PanelHeader({ task, onRename, onDoneChange, onClose }: PanelHeaderProps) {
  const [name, setName] = useState(task.name)
  const inputRef = useRef<HTMLInputElement>(null)

  function commitRename() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== task.name) onRename(task.id, trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { commitRename(); onClose() }
    else if (e.key === 'Escape') { setName(task.name); onClose() }
  }

  function handleBlur() { commitRename() }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, padding: '12px 16px', borderBottom: `1px solid ${theme.colors.divider}`, margin: '-16px -16px 0' }}>
      <input type="checkbox" checked={task.done} onChange={(e) => onDoneChange(task.id, e.target.checked)} />
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
