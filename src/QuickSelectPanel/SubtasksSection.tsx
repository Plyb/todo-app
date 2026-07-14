import { useRef, useState } from 'react'
import type { Task, SubtaskLink } from '../types'
import { createSubtaskLink, updateSubtaskLinkRank, loadAllSubtaskLinks } from '../db'
import { useTasks } from '../tasks-context'
import { LinkExistingTaskModal } from '../LinkExistingTaskModal'
import { DraggableList } from '../DraggableList'
import { rankBetween } from '../rank-utils'
import { theme } from '../theme'
import { resolveSubtaskItems } from './derivations'

type SubtasksSectionProps = {
  task: Task
  allTasks: Task[]
  subtaskLinks: SubtaskLink[]
  setSubtaskLinks: React.Dispatch<React.SetStateAction<SubtaskLink[]>>
  onOpenTask: (id: number) => void
  onSubtaskLinkAdded: () => void
}

export function SubtasksSection({ task, allTasks, subtaskLinks, setSubtaskLinks, onOpenTask, onSubtaskLinkAdded }: SubtasksSectionProps) {
  const { createTask, setDone } = useTasks()
  const [newSubtaskName, setNewSubtaskName] = useState('')
  const [showLinkExistingModal, setShowLinkExistingModal] = useState(false)
  const [linkedTaskIds, setLinkedTaskIds] = useState<Set<number>>(new Set())
  const submittingRef = useRef(false)

  async function handleAddSubtask() {
    if (submittingRef.current) return
    const trimmed = newSubtaskName.trim()
    if (!trimmed) return
    submittingRef.current = true
    try {
      const lastLink = subtaskLinks[subtaskLinks.length - 1] ?? null
      const linkRank = rankBetween(lastLink, null)
      const newTask = await createTask(trimmed, rankBetween(null, null), task.statusSlug)
      const link = await createSubtaskLink(task.id, newTask.id, linkRank)
      setSubtaskLinks((prev) => [...prev, link])
      onSubtaskLinkAdded()
      setNewSubtaskName('')
    } finally {
      submittingRef.current = false
    }
  }

  function handleSubtaskReorder(draggedLinkId: number, insertIndex: number) {
    const others = subtaskLinks.filter((l) => l.id !== draggedLinkId)
    const prev = insertIndex > 0 ? others[insertIndex - 1] : null
    const next = insertIndex < others.length ? others[insertIndex] : null
    const rank = rankBetween(prev, next)
    updateSubtaskLinkRank(draggedLinkId, rank)
    const dragged = subtaskLinks.find((l) => l.id === draggedLinkId)!
    const updated = { ...dragged, rank }
    const reordered = [...others]
    reordered.splice(insertIndex, 0, updated)
    setSubtaskLinks(reordered)
  }

  async function openLinkExistingModal() {
    const allLinks = await loadAllSubtaskLinks()
    setLinkedTaskIds(new Set(allLinks.map((l) => l.childTaskId)))
    setShowLinkExistingModal(true)
  }

  async function handleLinkExistingTask(selected: Task) {
    const lastLink = subtaskLinks[subtaskLinks.length - 1] ?? null
    const rank = rankBetween(lastLink, null)
    const link = await createSubtaskLink(task.id, selected.id, rank)
    setSubtaskLinks((prev) => [...prev, link])
    onSubtaskLinkAdded()
    setShowLinkExistingModal(false)
  }

  const subtaskItems = resolveSubtaskItems(subtaskLinks, allTasks)

  return (
    <>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: theme.fontSizes.lg, marginBottom: 8 }}>Subtasks</div>

        {subtaskItems.length > 0 && (
          <DraggableList
            sections={[{ items: subtaskItems }]}
            onReorder={(draggedLinkId, _sectionIndex, insertIndex) => handleSubtaskReorder(draggedLinkId, insertIndex)}
            renderItem={({ childTask }) => (
              <>
                <input
                  type="checkbox"
                  checked={childTask.done}
                  onChange={(e) => setDone(childTask.id, e.target.checked)}
                />
                <span onClick={() => onOpenTask(childTask.id)} style={{ marginLeft: 8, cursor: 'pointer', color: childTask.done ? theme.colors.textDisabled : undefined }}>
                  {childTask.name}
                </span>
              </>
            )}
          />
        )}

        <input
          type="text"
          placeholder="Add subtask..."
          value={newSubtaskName}
          onChange={(e) => setNewSubtaskName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { handleAddSubtask() } }}
          onBlur={handleAddSubtask}
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: theme.fontSizes.md,
            border: '1px solid #ddd',
            borderRadius: theme.radii.md,
            marginTop: subtaskItems.length > 0 ? 8 : 0,
            boxSizing: 'border-box',
          }}
        />

        <button
          onClick={openLinkExistingModal}
          style={{
            marginTop: 8,
            padding: '8px 16px',
            background: '#f5f5f5',
            border: '1px solid #ddd',
            borderRadius: theme.radii.lg,
            cursor: 'pointer',
            fontSize: theme.fontSizes.md,
          }}
        >
          Link Existing Task
        </button>
      </div>

      {showLinkExistingModal && (
        <LinkExistingTaskModal
          currentTaskId={task.id}
          allTasks={allTasks}
          excludedTaskIds={linkedTaskIds}
          onClose={() => setShowLinkExistingModal(false)}
          onSelect={handleLinkExistingTask}
        />
      )}
    </>
  )
}
