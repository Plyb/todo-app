import type { View } from './types'
import { SelectListModal } from './ui/SelectListModal'
import { sortViewsByRecency } from './modal-derivations'

type ViewModalProps = {
  views: View[]
  recentViewSlugs: string[]
  currentViewSlug: string
  onSelect: (slug: string) => void
  onClose: () => void
}

export function ViewModal({ views, recentViewSlugs, currentViewSlug, onSelect, onClose }: ViewModalProps) {
  const sortedViews = sortViewsByRecency(views, recentViewSlugs)

  return (
    <SelectListModal
      items={sortedViews}
      getKey={(view) => view.slug}
      getLabel={(view) => view.name}
      isCurrent={(view) => view.slug === currentViewSlug}
      title="Open"
      onSelect={(view) => onSelect(view.slug)}
      onClose={onClose}
    />
  )
}
