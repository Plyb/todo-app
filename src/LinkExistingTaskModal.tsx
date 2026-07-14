import type { Task } from './types'
import { theme } from './theme'
import { BottomSheet } from './ui/Modal'
import { CloseButton } from './ui/CloseButton'
import { TaskSearchList } from './ui/TaskSearchList'
import { selectableTasks } from './storage'

type LinkExistingTaskModalProps = {
  currentTaskId: number
  allTasks: Task[]
  excludedTaskIds: Set<number>
  title?: string
  onClose: () => void
  onSelect: (task: Task) => void
}

export function LinkExistingTaskModal({ currentTaskId, allTasks, excludedTaskIds, title = 'Link Existing Task', onClose, onSelect }: LinkExistingTaskModalProps) {
  const candidates = selectableTasks(allTasks, { currentTaskId, excludedIds: excludedTaskIds })

  return (
    <BottomSheet onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: theme.fontSizes.xl }}>{title}</span>
        <CloseButton onClick={onClose} />
      </div>
      <TaskSearchList tasks={candidates} onSelect={onSelect} />
    </BottomSheet>
  )
}
