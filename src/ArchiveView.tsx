import { Fragment, type ReactNode, type CSSProperties } from 'react'
import type { Task } from './types'
import { theme } from './theme'

type ArchiveViewProps = {
  tasks: Task[]
  renderItem: (task: Task) => ReactNode
  itemStyle?: (task: Task) => CSSProperties
  onItemClick?: (id: number) => void
  expandedSlot?: { afterItemId: number; content: ReactNode }
}

// The archive view never allows dragging (see issue #91), so unlike the
// status-based views it doesn't go through DraggableList at all - just a
// plain list of rows, in the order it's given (sortArchivedTasks upstream).
export function ArchiveView({ tasks, renderItem, itemStyle, onItemClick, expandedSlot }: ArchiveViewProps) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', flex: '1 0 auto' }}>
      {tasks.map((task) => (
        <Fragment key={task.id}>
          <li
            data-item-row
            onClick={(e) => {
              e.stopPropagation()
              onItemClick?.(task.id)
            }}
            style={{
              listStyle: 'none',
              boxSizing: 'border-box',
              padding: '12px 16px',
              borderBottom: `1px solid ${theme.colors.divider}`,
              cursor: onItemClick ? 'pointer' : undefined,
              ...itemStyle?.(task),
            }}
          >
            {renderItem(task)}
          </li>
          {expandedSlot?.afterItemId === task.id && (
            <li style={{ listStyle: 'none', position: 'relative', zIndex: 11 }} onClick={(e) => e.stopPropagation()}>
              {expandedSlot.content}
            </li>
          )}
        </Fragment>
      ))}
    </ul>
  )
}
