import type { View } from './types'
import { SelectListModal } from './ui/SelectListModal'
import { sortViewsByRecency } from './modal-derivations'

type ViewModalProps = {
  views: View[]
  recentViewIds: string[]
  currentViewId: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function ViewModal({ views, recentViewIds, currentViewId, onSelect, onClose }: ViewModalProps) {
  const sortedViews = sortViewsByRecency(views, recentViewIds)

  return (
    <SelectListModal
      items={sortedViews}
      getKey={(view) => view.id}
      getLabel={(view) => view.name}
      isCurrent={(view) => view.id === currentViewId}
      title="Open"
      onSelect={(view) => onSelect(view.id)}
      onClose={onClose}
    />
  )
}
