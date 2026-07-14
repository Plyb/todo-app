import type { View } from './types'
import { theme } from './theme'
import { Modal } from './ui/Modal'

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
    <Modal onClose={onClose} cardStyle={{ padding: '8px 0', minWidth: 240, maxWidth: 360, width: '80%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 4px' }}>
        <span style={{ fontWeight: 600, fontSize: theme.fontSizes.xl }}>Open</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: theme.fontSizes.xxl, lineHeight: 1, padding: 4 }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {sortedViews.map((view) => (
        <button
          key={view.slug}
          onClick={() => { onSelect(view.slug); onClose() }}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: view.slug === currentViewSlug ? theme.colors.selected : 'none',
            border: 'none',
            padding: '12px 16px',
            cursor: 'pointer',
            fontSize: theme.fontSizes.lg,
            fontWeight: view.slug === currentViewSlug ? 600 : 400,
          }}
        >
          {view.name}
          {view.slug === currentViewSlug && (
            <span style={{ marginLeft: 8, color: theme.colors.brand, fontSize: theme.fontSizes.xs }}>current</span>
          )}
        </button>
      ))}
    </Modal>
  )
}
