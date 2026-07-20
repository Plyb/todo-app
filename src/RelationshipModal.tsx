import { useState } from 'react'
import type { Task } from './types'
import { useSource } from './tasks-context'
import { theme } from './theme'
import { BottomSheet } from './ui/Modal'
import { CloseButton } from './ui/CloseButton'
import { TaskSearchList } from './ui/TaskSearchList'
import { selectableTasks } from './storage'

type RelatedTaskEntryProps = { task: Task; onOpen: (id: number) => void; onDoneChange: (id: number, done: boolean) => void }

export function RelatedTaskEntry({ task, onOpen, onDoneChange }: RelatedTaskEntryProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.space.sm,
        padding: '8px 0',
        borderBottom: `1px solid ${theme.colors.divider}`,
      }}
    >
      <input
        type="checkbox"
        checked={task.completedAt !== null}
        onChange={(e) => onDoneChange(task.id, e.target.checked)}
      />
      <span onClick={() => onOpen(task.id)} style={{ cursor: 'pointer', color: task.completedAt !== null ? theme.colors.textDisabled : undefined }}>
        {task.name}
      </span>
    </div>
  )
}

type RelationshipGroupProps = { label: string; tasks: Task[]; onOpenTask: (id: number) => void; onDoneChange: (id: number, done: boolean) => void }

export function RelationshipGroup({ label, tasks, onOpenTask, onDoneChange }: RelationshipGroupProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, fontSize: theme.fontSizes.sm, color: '#555', marginBottom: 4 }}>{label}</div>
      {tasks.map((task) => (
        <RelatedTaskEntry key={task.id} task={task} onOpen={onOpenTask} onDoneChange={onDoneChange} />
      ))}
    </div>
  )
}

type TypeButtonProps = { label: string; description: React.ReactNode; onClick: () => void }

function TypeButton({ label, description, onClick }: TypeButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '12px 16px',
        textAlign: 'left',
        background: '#f5f5f5',
        border: '1px solid #ddd',
        borderRadius: theme.radii.lg,
        cursor: 'pointer',
        fontSize: theme.fontSizes.lg,
        marginBottom: 8,
      }}
    >
      <strong>{label}</strong> — {description}
    </button>
  )
}

type RelationshipModalState =
  | { view: 'search' }
  | { view: 'choose-type'; selectedTask: Task }

type RelationshipModalProps = {
  currentTaskId: number
  allTasks: Task[]
  onClose: () => void
  onBlockingRelationshipAdded?: () => void
}

export function RelationshipModal({ currentTaskId, allTasks, onClose, onBlockingRelationshipAdded }: RelationshipModalProps) {
  const [state, setState] = useState<RelationshipModalState>({ view: 'search' })
  const currentTask = allTasks.find((t) => t.id === currentTaskId)!
  const source = useSource(currentTask.sourceId)

  const otherTasks = selectableTasks(allTasks, { currentTaskId })

  return (
    <BottomSheet onClose={onClose}>
      {state.view === 'search' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: theme.fontSizes.xl }}>Add Relationship</span>
            <CloseButton onClick={onClose} />
          </div>
          <TaskSearchList tasks={otherTasks} onSelect={(task) => setState({ view: 'choose-type', selectedTask: task })} />
        </>
      )}

      {state.view === 'choose-type' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: theme.space.sm }}>
            <button
              onClick={() => setState({ view: 'search' })}
              style={{ background: 'none', border: 'none', fontSize: theme.fontSizes.xxl, cursor: 'pointer', padding: 0 }}
            >
              ←
            </button>
            <span style={{ fontWeight: 700, fontSize: theme.fontSizes.xl }}>Choose relationship type</span>
          </div>
          <div style={{ color: theme.colors.textSecondary, fontSize: theme.fontSizes.md, marginBottom: 8 }}>
            Relating to: <strong>{state.selectedTask.name}</strong>
          </div>
          <TypeButton
            label="Blocks"
            description={<>this task blocks <strong>{state.selectedTask.name}</strong></>}
            onClick={async () => {
              await source.addBlock(currentTaskId, state.selectedTask.id, 'blocks')
              onBlockingRelationshipAdded?.()
              onClose()
            }}
          />
          <TypeButton
            label="Blocked By"
            description={<><strong>{state.selectedTask.name}</strong> blocks this task</>}
            onClick={async () => {
              await source.addBlock(state.selectedTask.id, currentTaskId, 'blocks')
              onBlockingRelationshipAdded?.()
              onClose()
            }}
          />
        </>
      )}
    </BottomSheet>
  )
}
