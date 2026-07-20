import { useEffect, useState } from 'react'
import type { Task, SubtaskLink } from '../types'
import { useDefaultSource } from '../tasks-context'
import { LinkExistingTaskModal } from '../LinkExistingTaskModal'
import { rankBetween } from '../rank-utils'
import { theme } from '../theme'

type ParentSectionProps = {
  task: Task
  allTasks: Task[]
  subtaskLinks: SubtaskLink[]
  onOpenTask: (id: number) => void
  onSubtaskLinkAdded: () => void
}

export function ParentSection({ task, allTasks, subtaskLinks, onOpenTask, onSubtaskLinkAdded }: ParentSectionProps) {
  const [parentLink, setParentLink] = useState<SubtaskLink | undefined>(undefined)
  const [showSetParentModal, setShowSetParentModal] = useState(false)
  const source = useDefaultSource()

  useEffect(() => {
    source.loadParentLink(task.id).then(setParentLink)
  }, [task.id, source])

  const parentTask = parentLink ? allTasks.find((t) => t.id === parentLink.parentTaskId) : undefined

  async function handleSetParent(selected: Task) {
    if (parentLink) await source.deleteSubtaskLinksByChild(task.id)
    const newParentLinks = await source.loadSubtaskLinks(selected.id)
    const lastLink = newParentLinks[newParentLinks.length - 1] ?? null
    const rank = rankBetween(lastLink, null)
    const link = await source.createSubtaskLink(selected.id, task.id, rank)
    setParentLink(link)
    onSubtaskLinkAdded()
    setShowSetParentModal(false)
  }

  async function handleClearParent() {
    await source.deleteSubtaskLinksByChild(task.id)
    setParentLink(undefined)
    onSubtaskLinkAdded()
  }

  return (
    <>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: theme.fontSizes.lg, marginBottom: 8 }}>Parent</div>

        {parentTask ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm }}>
            <button
              onClick={() => onOpenTask(parentTask.id)}
              style={{
                background: theme.colors.selected,
                border: 'none',
                borderRadius: theme.radii.md,
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: theme.fontSizes.md,
                color: theme.colors.brand,
                fontWeight: 500,
              }}
            >
              {parentTask.name}
            </button>
            <button
              onClick={handleClearParent}
              style={{ background: 'none', border: 'none', color: theme.colors.danger, cursor: 'pointer', fontSize: theme.fontSizes.md }}
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSetParentModal(true)}
            style={{
              padding: '8px 16px',
              background: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: theme.radii.lg,
              cursor: 'pointer',
              fontSize: theme.fontSizes.md,
            }}
          >
            Set Parent
          </button>
        )}
      </div>

      {showSetParentModal && (
        <LinkExistingTaskModal
          currentTaskId={task.id}
          allTasks={allTasks}
          excludedTaskIds={new Set(subtaskLinks.map((l) => l.childTaskId))}
          title="Set Parent"
          onClose={() => setShowSetParentModal(false)}
          onSelect={handleSetParent}
        />
      )}
    </>
  )
}
