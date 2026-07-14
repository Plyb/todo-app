import { useEffect, useState } from 'react'
import type { Task, Status, SubtaskLink, ScheduledTransition } from '../types'
import { loadSubtaskLinks, loadScheduledTransitions } from '../db'
import { StatusModal } from '../StatusModal'
import { ScheduleModal } from '../ScheduleModal'
import { theme } from '../theme'
import { PanelHeader } from './PanelHeader'
import { DeleteConfirm } from './DeleteConfirm'
import { ParentSection } from './ParentSection'
import { SubtasksSection } from './SubtasksSection'
import { RelatedTasksSection } from './RelatedTasksSection'

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
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [notes, setNotes] = useState(task.notes)
  const [expanded, setExpanded] = useState(false)
  const [subtaskLinks, setSubtaskLinks] = useState<SubtaskLink[]>([])
  const [scheduledTransitions, setScheduledTransitions] = useState<ScheduledTransition[]>([])

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
  }, [task.id])

  const currentStatus = statuses.find((s) => s.slug === task.statusSlug)

  function handleClose() {
    setExpanded(false)
    setTimeout(onClose, 200)
  }

  function handleNotesBlur() {
    if (notes !== task.notes) {
      onUpdateNotes(task.id, notes)
    }
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

      {statusModalOpen && (
        <StatusModal
          statuses={statuses}
          currentStatusSlug={task.statusSlug}
          onSelect={(slug) => onChangeStatus(task.id, slug)}
          onClose={() => setStatusModalOpen(false)}
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
