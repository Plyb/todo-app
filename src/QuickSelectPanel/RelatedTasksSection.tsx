import { useEffect, useState } from 'react'
import type { Task, BlockingRelationship } from '../types'
import { useTasks, useSource } from '../tasks-context'
import { RelationshipModal, RelationshipGroup } from '../RelationshipModal'
import { theme } from '../theme'
import { PrimaryButton } from '../ui/Button'
import { groupBlockingRelationships } from './derivations'

type RelatedTasksSectionProps = {
  task: Task
  allTasks: Task[]
  onOpenTask: (id: number) => void
  onBlockingRelationshipAdded: () => void
}

export function RelatedTasksSection({ task, allTasks, onOpenTask, onBlockingRelationshipAdded }: RelatedTasksSectionProps) {
  const { setDone } = useTasks()
  const source = useSource(task.sourceId)
  const [showRelationshipModal, setShowRelationshipModal] = useState(false)
  const [blockingRelationships, setBlockingRelationships] = useState<BlockingRelationship[]>([])

  useEffect(() => {
    source.loadBlocks(task.id).then(setBlockingRelationships)
  }, [task.id, source])

  function reloadRelationships() {
    source.loadBlocks(task.id).then(setBlockingRelationships)
    onBlockingRelationshipAdded()
  }

  const relatedGroups = groupBlockingRelationships(task, allTasks, blockingRelationships)

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
