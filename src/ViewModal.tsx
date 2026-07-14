import type { View } from './types'
import { SelectListModal } from './ui/SelectListModal'

type ViewModalProps = {
  views: View[]
  recentViewSlugs: string[]
  currentViewSlug: string
  onSelect: (slug: string) => void
  onClose: () => void
}

export function ViewModal({ views, recentViewSlugs, currentViewSlug, onSelect, onClose }: ViewModalProps) {
  const sortedViews = [...views].sort((a, b) => {
    const aIndex = recentViewSlugs.indexOf(a.slug)
    const bIndex = recentViewSlugs.indexOf(b.slug)
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    return 0
  })

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
