import { useEffect, useState } from 'react'
import type { Task, Status, SubtaskLink } from '../types'
import { theme } from '../theme'
import { useTasks, useSource } from '../tasks-context'
import { PanelHeader } from './PanelHeader'
import { DeleteConfirm } from './DeleteConfirm'
import { ParentSection } from './ParentSection'
import { SubtasksSection } from './SubtasksSection'
import { RelatedTasksSection } from './RelatedTasksSection'
import { NotesSection } from './NotesSection'
import { StatusScheduleSection } from './StatusScheduleSection'
import { ArchiveToggle } from './ArchiveToggle'

type QuickSelectPanelProps = {
  task: Task
  statuses: Status[]
  allTasks: Task[]
  onClose: () => void
  onChangeStatus: (id: number, statusSlug: string) => void
  onDelete: (id: number) => void
  onOpenTask: (id: number) => void
  onBlockingRelationshipAdded: () => void
  onSubtaskLinkAdded: () => void
}

export function QuickSelectPanel({ task, statuses, allTasks, onClose, onChangeStatus, onDelete, onOpenTask, onBlockingRelationshipAdded, onSubtaskLinkAdded }: QuickSelectPanelProps) {
  const { setArchived } = useTasks()
  const source = useSource(task.sourceId)
  const [backdropReady, setBackdropReady] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [subtaskLinks, setSubtaskLinks] = useState<SubtaskLink[]>([])
  const [archivedDraft, setArchivedDraft] = useState(task.archivedAt !== null)

  useEffect(() => {
    // Reload the draft whenever the panel is pointed at a (possibly different) task,
    // since this same panel instance is reused across selections rather than remounted.
    setArchivedDraft(task.archivedAt !== null)
  }, [task.id, task.archivedAt])

  useEffect(() => {
    const id = requestAnimationFrame(() => setExpanded(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    // Delay backdrop interaction until after panel animation finishes to prevent accidental close
    const t = setTimeout(() => setBackdropReady(true), theme.durations.panelBackdropArm)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    source.loadSubtaskLinks(task.id).then(setSubtaskLinks)
  }, [task.id, source])

  function handleClose() {
    if (archivedDraft !== (task.archivedAt !== null)) {
      setArchived(task.id, archivedDraft)
    }
    setExpanded(false)
    setTimeout(onClose, theme.durations.panelExpand)
  }

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
        <PanelHeader task={task} onClose={handleClose} />

        <div style={{
          overflow: 'hidden',
          maxHeight: expanded ? '1000px' : '0',
          transition: `max-height ${theme.durations.panelExpand}ms ease`,
        }}>
          <NotesSection task={task} />

          <StatusScheduleSection task={task} statuses={statuses} onChangeStatus={onChangeStatus} />

          <ArchiveToggle archived={archivedDraft} onChange={setArchivedDraft} />

          <DeleteConfirm taskId={task.id} onDelete={onDelete} onClose={handleClose} />

          <ParentSection
            task={task}
            allTasks={allTasks}
            subtaskLinks={subtaskLinks}
            onOpenTask={onOpenTask}
            onSubtaskLinkAdded={onSubtaskLinkAdded}
          />

          <SubtasksSection
            task={task}
            allTasks={allTasks}
            subtaskLinks={subtaskLinks}
            setSubtaskLinks={setSubtaskLinks}
            onOpenTask={onOpenTask}
            onSubtaskLinkAdded={onSubtaskLinkAdded}
          />

          <RelatedTasksSection
            task={task}
            allTasks={allTasks}
            onOpenTask={onOpenTask}
            onBlockingRelationshipAdded={onBlockingRelationshipAdded}
          />
        </div>
      </div>
    </>
  )
}
