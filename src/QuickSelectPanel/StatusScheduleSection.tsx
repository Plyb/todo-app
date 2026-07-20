import { useEffect, useState } from 'react'
import type { Task, Status, ScheduledTransition } from '../types'
import { useDefaultSource } from '../tasks-context'
import { StatusModal } from '../StatusModal'
import { ScheduleModal } from '../ScheduleModal'
import { theme } from '../theme'

type StatusScheduleSectionProps = {
  task: Task
  statuses: Status[]
  onChangeStatus: (id: number, statusSlug: string) => void
}

export function StatusScheduleSection({ task, statuses, onChangeStatus }: StatusScheduleSectionProps) {
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [scheduledTransitions, setScheduledTransitions] = useState<ScheduledTransition[]>([])
  const source = useDefaultSource()

  useEffect(() => {
    source.loadScheduledTransitions(task.id).then(setScheduledTransitions)
  }, [task.id, source])

  const currentStatus = statuses.find((s) => s.slug === task.statusSlug)

  return (
    <>
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
          onTransitionsChanged={() => source.loadScheduledTransitions(task.id).then(setScheduledTransitions)}
        />
      )}
    </>
  )
}
