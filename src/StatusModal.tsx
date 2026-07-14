import type { Status } from './types'
import { SelectListModal } from './ui/SelectListModal'

type StatusModalProps = {
  statuses: Status[]
  currentStatusSlug: string
  onSelect: (slug: string) => void
  onClose: () => void
  title?: string
}

export function StatusModal({ statuses, currentStatusSlug, onSelect, onClose, title = 'Set Status' }: StatusModalProps) {
  return (
    <SelectListModal
      items={statuses}
      getKey={(status) => status.slug}
      getLabel={(status) => status.name}
      isCurrent={(status) => status.slug === currentStatusSlug}
      title={title}
      onSelect={(status) => onSelect(status.slug)}
      onClose={onClose}
    />
  )
}
