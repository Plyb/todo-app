import type { View } from './db'

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
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 12,
          padding: '8px 0',
          minWidth: 240,
          maxWidth: 360,
          width: '80%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 4px' }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>Open</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {sortedViews.map((view) => (
          <button
            key={view.id}
            onClick={() => { onSelect(view.slug); onClose() }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: view.slug === currentViewSlug ? '#e8f0fe' : 'none',
              border: 'none',
              padding: '12px 16px',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: view.slug === currentViewSlug ? 600 : 400,
            }}
          >
            {view.name}
            {view.slug === currentViewSlug && (
              <span style={{ marginLeft: 8, color: '#1a73e8', fontSize: 12 }}>current</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
