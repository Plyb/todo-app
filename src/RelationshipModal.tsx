import { useState } from 'react'
import type { Task } from './tasks'
import { addBlock } from './tasks'

type RelatedTaskEntryProps = { task: Task; onOpen: (id: number) => void }

export function RelatedTaskEntry({ task, onOpen }: RelatedTaskEntryProps) {
  return (
    <div
      onClick={() => onOpen(task.id)}
      style={{
        padding: '8px 0',
        cursor: 'pointer',
        borderBottom: '1px solid #eee',
      }}
    >
      {task.name}
    </div>
  )
}

type RelationshipGroupProps = { label: string; tasks: Task[]; onOpenTask: (id: number) => void }

export function RelationshipGroup({ label, tasks, onOpenTask }: RelationshipGroupProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#555', marginBottom: 4 }}>{label}</div>
      {tasks.map((task) => (
        <RelatedTaskEntry key={task.id} task={task} onOpen={onOpenTask} />
      ))}
    </div>
  )
}

type DirectionButtonProps = { label: string; description: React.ReactNode; onClick: () => void }

function DirectionButton({ label, description, onClick }: DirectionButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '12px 16px',
        textAlign: 'left',
        background: '#f5f5f5',
        border: '1px solid #ddd',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 15,
        marginBottom: 8,
      }}
    >
      <strong>{label}</strong> — {description}
    </button>
  )
}

type RelationshipModalState =
  | { view: 'search' }
  | { view: 'choose-direction'; selectedTask: Task }

type RelationshipModalProps = {
  currentTaskId: number
  allTasks: Task[]
  onClose: () => void
  onRelationshipAdded?: () => void
}

export function RelationshipModal({ currentTaskId, allTasks, onClose, onRelationshipAdded }: RelationshipModalProps) {
  const [state, setState] = useState<RelationshipModalState>({ view: 'search' })
  const [query, setQuery] = useState('')

  const otherTasks = allTasks.filter((t) => t.id !== currentTaskId)
  const filtered = otherTasks.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase())
  )

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
        {state.view === 'search' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Add Relationship</span>
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
                  onClick={() => setState({ view: 'choose-direction', selectedTask: task })}
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
          </>
        )}

        {state.view === 'choose-direction' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
              <button
                onClick={() => setState({ view: 'search' })}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 0 }}
              >
                ←
              </button>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Choose relationship direction</span>
            </div>
            <div style={{ color: '#888', fontSize: 14, marginBottom: 8 }}>
              Relating to: <strong>{state.selectedTask.name}</strong>
            </div>
            <DirectionButton
              label="Blocks"
              description={<>this task blocks <strong>{state.selectedTask.name}</strong></>}
              onClick={async () => {
                await addBlock(currentTaskId, state.selectedTask.id, 'blocks')
                onRelationshipAdded?.()
                onClose()
              }}
            />
            <DirectionButton
              label="Blocked By"
              description={<><strong>{state.selectedTask.name}</strong> blocks this task</>}
              onClick={async () => {
                await addBlock(state.selectedTask.id, currentTaskId, 'blocks')
                onRelationshipAdded?.()
                onClose()
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
