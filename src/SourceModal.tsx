import type { TaskSource } from './sources'
import { SelectListModal } from './ui/SelectListModal'

type SourceModalProps = {
  sources: TaskSource[]
  currentSourceId: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function SourceModal({ sources, currentSourceId, onSelect, onClose }: SourceModalProps) {
  return (
    <SelectListModal
      items={sources}
      getKey={(source) => source.id}
      getLabel={(source) => source.id}
      isCurrent={(source) => source.id === currentSourceId}
      title="Add Task Into"
      onSelect={(source) => onSelect(source.id)}
      onClose={onClose}
    />
  )
}
