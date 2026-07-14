import { useEffect, useState } from 'react'
import type { Task, Status, SubtaskLink } from '../types'
import { loadSubtaskLinks } from '../db'
import { theme } from '../theme'
import { PanelHeader } from './PanelHeader'
import { DeleteConfirm } from './DeleteConfirm'
import { ParentSection } from './ParentSection'
import { SubtasksSection } from './SubtasksSection'
import { RelatedTasksSection } from './RelatedTasksSection'
import { NotesSection } from './NotesSection'
import { StatusScheduleSection } from './StatusScheduleSection'

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
  onSubtaskLinkAdded?: () => void
}

export function QuickSelectPanel({ task, statuses, allTasks, onClose, onRename, onChangeStatus, onDelete, onUpdateNotes, onOpenTask, onDoneChange, onBlockingRelationshipAdded, onSubtaskLinkAdded }: QuickSelectPanelProps) {
  const [backdropReady, setBackdropReady] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [subtaskLinks, setSubtaskLinks] = useState<SubtaskLink[]>([])

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
  }, [task.id])

  function handleClose() {
    setExpanded(false)
    setTimeout(onClose, 200)
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
        <PanelHeader task={task} onRename={onRename} onDoneChange={onDoneChange} onClose={handleClose} />

        <div style={{
          overflow: 'hidden',
          maxHeight: expanded ? '1000px' : '0',
          transition: 'max-height 0.2s ease',
        }}>
          <NotesSection task={task} onUpdateNotes={onUpdateNotes} />

          <StatusScheduleSection task={task} statuses={statuses} onChangeStatus={onChangeStatus} />

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
            onDoneChange={onDoneChange}
            onSubtaskLinkAdded={onSubtaskLinkAdded}
          />

          <RelatedTasksSection
            task={task}
            allTasks={allTasks}
            onOpenTask={onOpenTask}
            onDoneChange={onDoneChange}
            onBlockingRelationshipAdded={onBlockingRelationshipAdded}
          />
        </div>
      </div>
    </>
  )
}
