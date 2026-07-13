import { useEffect, useRef, useState } from 'react'
import type { Task, Status, SubtaskLink, ScheduledTransition, BlockingRelationship } from './types'
import { loadSubtaskLinks, createSubtaskLink, updateSubtaskLinkRank, loadAllSubtaskLinks, loadParentLink, deleteSubtaskLinksByChild, createTask, loadScheduledTransitions, loadBlocks } from './db'
import { StatusModal } from './StatusModal'
import { RelationshipModal, RelationshipGroup } from './RelationshipModal'
import { LinkExistingTaskModal } from './LinkExistingTaskModal'
import { ScheduleModal } from './ScheduleModal'
import { DraggableList } from './DraggableList'
import { rankBetween } from './rank-utils'
import { theme } from './theme'

type QuickSelectPanelProps = {
  task: Task
  statuses: Status[]
  allTasks: Task[]
  onClose: () => void
  onRename: (id: number, name: string) => void
  onChangeStatus: (id: number, statusSlug: string) => void
  onDelete: (id: number) => void
  onUpdateNotes: (id: number, notes: string) => void
  onOpenTask: (id: number) => void
  onDoneChange: (id: number, done: boolean) => void
  onBlockingRelationshipAdded?: () => void
  onTaskCreated: (task: Task) => void
  onSubtaskLinkAdded?: () => void
}

export function QuickSelectPanel({ task, statuses, allTasks, onClose, onRename, onChangeStatus, onDelete, onUpdateNotes, onOpenTask, onDoneChange, onBlockingRelationshipAdded, onTaskCreated, onSubtaskLinkAdded }: QuickSelectPanelProps) {
  const [name, setName] = useState(task.name)
  const [backdropReady, setBackdropReady] = useState(false)
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showRelationshipModal, setShowRelationshipModal] = useState(false)
  const [notes, setNotes] = useState(task.notes)
  const [blockingRelationships, setBlockingRelationships] = useState<BlockingRelationship[]>([])
  const [expanded, setExpanded] = useState(false)
  const [subtaskLinks, setSubtaskLinks] = useState<SubtaskLink[]>([])
  const [newSubtaskName, setNewSubtaskName] = useState('')
  const [showLinkExistingModal, setShowLinkExistingModal] = useState(false)
  const [linkedTaskIds, setLinkedTaskIds] = useState<Set<number>>(new Set())
  const [parentLink, setParentLink] = useState<SubtaskLink | undefined>(undefined)
  const [showSetParentModal, setShowSetParentModal] = useState(false)
  const [scheduledTransitions, setScheduledTransitions] = useState<ScheduledTransition[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setExpanded(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setBackdropReady(true), 350)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    loadSubtaskLinks(task.id).then(setSubtaskLinks)
    loadScheduledTransitions(task.id).then(setScheduledTransitions)
    loadParentLink(task.id).then(setParentLink)
  }, [task.id])

  useEffect(() => {
    loadBlocks(task.id).then(setBlockingRelationships)
  }, [task.id])

  function reloadRelationships() {
    loadBlocks(task.id).then(setBlockingRelationships)
    onBlockingRelationshipAdded?.()
  }

  const currentStatus = statuses.find((s) => s.slug === task.statusSlug)
  const parentTask = parentLink ? allTasks.find((t) => t.id === parentLink.parentTaskId) : undefined

  function handleClose() {
    setExpanded(false)
    setTimeout(onClose, 200)
  }

  function commitRename() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== task.name) onRename(task.id, trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { commitRename(); handleClose() }
    else if (e.key === 'Escape') { setName(task.name); handleClose() }
  }

  function handleBlur() { commitRename() }

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

  function handleNotesBlur() {
    if (notes !== task.notes) {
      onUpdateNotes(task.id, notes)
    }
  }

  async function handleAddSubtask() {
    const trimmed = newSubtaskName.trim()
    if (!trimmed) return
    const lastLink = subtaskLinks[subtaskLinks.length - 1] ?? null
    const linkRank = rankBetween(lastLink, null)
    const newTask = await createTask(trimmed, rankBetween(null, null), task.statusSlug)
    onTaskCreated(newTask)
    const link = await createSubtaskLink(task.id, newTask.id, linkRank)
    setSubtaskLinks((prev) => [...prev, link])
    onSubtaskLinkAdded?.()
    setNewSubtaskName('')
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
    onSubtaskLinkAdded?.()
    setShowLinkExistingModal(false)
  }

  async function handleSetParent(selected: Task) {
    if (parentLink) await deleteSubtaskLinksByChild(task.id)
    const newParentLinks = await loadSubtaskLinks(selected.id)
    const lastLink = newParentLinks[newParentLinks.length - 1] ?? null
    const rank = rankBetween(lastLink, null)
    const link = await createSubtaskLink(selected.id, task.id, rank)
    setParentLink(link)
    onSubtaskLinkAdded?.()
    setShowSetParentModal(false)
  }

  async function handleClearParent() {
    await deleteSubtaskLinksByChild(task.id)
    setParentLink(undefined)
    onSubtaskLinkAdded?.()
  }

  const subtaskItems = subtaskLinks
    .map((link) => {
      const childTask = allTasks.find((t) => t.id === link.childTaskId)
      return childTask ? { id: link.id, link, childTask } : undefined
    })
    .filter((item): item is { id: number; link: SubtaskLink; childTask: Task } => item !== undefined)

  return (
    <>
      <div onClick={backdropReady ? handleClose : undefined} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: theme.zIndex.panel, pointerEvents: backdropReady ? 'auto' : 'none' }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          padding: theme.space.md,
          zIndex: theme.zIndex.panelBackdrop,
          position: 'relative',
        }}
      >
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

        <div style={{
          overflow: 'hidden',
          maxHeight: expanded ? '1000px' : '0',
          transition: 'max-height 0.2s ease',
        }}>
          <label style={{ display: 'block', fontSize: theme.fontSizes.md, color: '#555', marginTop: 12, marginBottom: 4 }}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            style={{
              width: '100%',
              minHeight: 80,
              boxSizing: 'border-box',
              fontSize: theme.fontSizes.lg,
              padding: '8px 10px',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.md,
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, marginTop: 12 }}>
            <span style={{ color: '#666', fontSize: theme.fontSizes.md }}>Status:</span>
            <button
              onClick={() => setStatusModalOpen(true)}
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
              {currentStatus?.name ?? task.statusSlug}
            </button>
            <button
              onClick={() => setScheduleModalOpen(true)}
              style={{
                background: '#f3e8ff',
                border: 'none',
                borderRadius: theme.radii.md,
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: theme.fontSizes.md,
                color: '#7b1fa2',
                fontWeight: 500,
              }}
            >
              {scheduledTransitions.length > 0 ? `Schedule (${scheduledTransitions.length})` : 'Schedule'}
            </button>
          </div>

          {showConfirm ? (
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 12px' }}>Are you sure?</p>
              <button
                onClick={() => { onDelete(task.id); handleClose() }}
                style={{ marginRight: 8, color: '#fff', background: theme.colors.danger, border: 'none', borderRadius: theme.radii.sm, padding: '8px 16px', cursor: 'pointer' }}
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.sm, padding: '8px 16px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              style={{ marginTop: 16, color: '#fff', background: theme.colors.danger, border: 'none', borderRadius: theme.radii.sm, padding: '8px 16px', cursor: 'pointer' }}
            >
              Delete
            </button>
          )}

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
                      onChange={(e) => onDoneChange(childTask.id, e.target.checked)}
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
                  onDoneChange={onDoneChange}
                />
              ))
            )}

            <button
              onClick={() => setShowRelationshipModal(true)}
              style={{
                marginTop: 4,
                padding: '8px 16px',
                backgroundColor: theme.colors.brand,
                color: '#fff',
                border: 'none',
                borderRadius: theme.radii.lg,
                cursor: 'pointer',
                fontSize: theme.fontSizes.md,
              }}
            >
              Add Relationship
            </button>
          </div>
        </div>
      </div>

      {statusModalOpen && (
        <StatusModal
          statuses={statuses}
          currentStatusSlug={task.statusSlug}
          onSelect={(slug) => onChangeStatus(task.id, slug)}
          onClose={() => setStatusModalOpen(false)}
        />
      )}

      {showRelationshipModal && (
        <RelationshipModal
          currentTaskId={task.id}
          allTasks={allTasks}
          onClose={() => setShowRelationshipModal(false)}
          onBlockingRelationshipAdded={reloadRelationships}
        />
      )}

      {showLinkExistingModal && (
        <LinkExistingTaskModal
          currentTaskId={task.id}
          allTasks={allTasks}
          excludedTaskIds={linkedTaskIds}
          onClose={() => setShowLinkExistingModal(false)}
          onSelect={handleLinkExistingTask}
        />
      )}

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

      {scheduleModalOpen && (
        <ScheduleModal
          task={task}
          statuses={statuses}
          onClose={() => setScheduleModalOpen(false)}
          onTransitionsChanged={() => loadScheduledTransitions(task.id).then(setScheduledTransitions)}
        />
      )}
    </>
  )
}
