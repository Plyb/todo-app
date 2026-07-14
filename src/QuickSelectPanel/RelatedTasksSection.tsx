import { useEffect, useState } from 'react'
import type { Task, BlockingRelationship } from '../types'
import { loadBlocks } from '../db'
import { useTasks } from '../tasks-context'
import { RelationshipModal, RelationshipGroup } from '../RelationshipModal'
import { theme } from '../theme'
import { PrimaryButton } from '../ui/Button'

type RelatedTasksSectionProps = {
  task: Task
  allTasks: Task[]
  onOpenTask: (id: number) => void
  onBlockingRelationshipAdded: () => void
}

export function RelatedTasksSection({ task, allTasks, onOpenTask, onBlockingRelationshipAdded }: RelatedTasksSectionProps) {
  const { setDone } = useTasks()
  const [showRelationshipModal, setShowRelationshipModal] = useState(false)
  const [blockingRelationships, setBlockingRelationships] = useState<BlockingRelationship[]>([])

  useEffect(() => {
    loadBlocks(task.id).then(setBlockingRelationships)
  }, [task.id])

  function reloadRelationships() {
    loadBlocks(task.id).then(setBlockingRelationships)
    onBlockingRelationshipAdded()
  }

  const blocksGroup = {
    label: 'Blocks',
    tasks: blockingRelationships
      .filter((r) => r.fromTaskId === task.id)
      .map((r) => allTasks.find((t) => t.id === r.toTaskId))
      .filter((t): t is Task => t !== undefined),
  }

  const blockedByGroup = {
    label: 'Blocked by',
    tasks: blockingRelationships
      .filter((r) => r.toTaskId === task.id)
      .map((r) => allTasks.find((t) => t.id === r.fromTaskId))
      .filter((t): t is Task => t !== undefined),
  }

  const relatedGroups: Array<{ label: string; tasks: Task[] }> = [
    ...(blocksGroup.tasks.length > 0 ? [blocksGroup] : []),
    ...(blockedByGroup.tasks.length > 0 ? [blockedByGroup] : []),
  ]

  return (
    <>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: theme.fontSizes.lg, marginBottom: 8 }}>Related Tasks</div>

        {relatedGroups.length === 0 ? (
          <div style={{ color: theme.colors.textDisabled, fontSize: theme.fontSizes.md, marginBottom: 12 }}>No related tasks</div>
        ) : (
          relatedGroups.map((group) => (
            <RelationshipGroup
              key={group.label}
              label={group.label}
              tasks={group.tasks}
              onOpenTask={onOpenTask}
              onDoneChange={setDone}
            />
          ))
        )}

        <PrimaryButton
          onClick={() => setShowRelationshipModal(true)}
          style={{ marginTop: 4, borderRadius: theme.radii.lg, fontSize: theme.fontSizes.md }}
        >
          Add Relationship
        </PrimaryButton>
      </div>

      {showRelationshipModal && (
        <RelationshipModal
          currentTaskId={task.id}
          allTasks={allTasks}
          onClose={() => setShowRelationshipModal(false)}
          onBlockingRelationshipAdded={reloadRelationships}
        />
      )}
    </>
  )
}
