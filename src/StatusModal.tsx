import type { Status, View } from './tasks'

type StatusModalProps = {
  statuses: Status[]
  views?: View[]
  recentStatusSlugs: string[]
  currentStatusSlug: string
  currentViewId?: string
  onSelect: (slug: string) => void
  onSelectView?: (id: string) => void
  onClose: () => void
}

export function StatusModal({
  statuses,
  views = [],
  recentStatusSlugs,
  currentStatusSlug,
  currentViewId,
  onSelect,
  onSelectView,
  onClose,
}: StatusModalProps) {
  const sortedStatuses = [...statuses].sort((a, b) => {
    const aIndex = recentStatusSlugs.indexOf(a.slug)
    const bIndex = recentStatusSlugs.indexOf(b.slug)
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

        {views.length > 0 && (
          <>
            <div style={{ padding: '6px 16px 2px', fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Views
            </div>
            {views.map((view) => (
              <button
                key={view.id}
                onClick={() => { onSelectView?.(view.id); onClose() }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: view.id === currentViewId ? '#e8f0fe' : 'none',
                  border: 'none',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  fontSize: 15,
                  fontWeight: view.id === currentViewId ? 600 : 400,
                }}
              >
                {view.name}
                {view.id === currentViewId && (
                  <span style={{ marginLeft: 8, color: '#1a73e8', fontSize: 12 }}>current</span>
                )}
              </button>
            ))}
            <div style={{ borderTop: '1px solid #eee', margin: '4px 0' }} />
          </>
        )}

        <div style={{ padding: '6px 16px 2px', fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Statuses
        </div>
        {sortedStatuses.map((status) => (
          <button
            key={status.slug}
            onClick={() => { onSelect(status.slug); onClose() }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: !currentViewId && status.slug === currentStatusSlug ? '#e8f0fe' : 'none',
              border: 'none',
              padding: '12px 16px',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: !currentViewId && status.slug === currentStatusSlug ? 600 : 400,
            }}
          >
            {status.name}
            {!currentViewId && status.slug === currentStatusSlug && (
              <span style={{ marginLeft: 8, color: '#1a73e8', fontSize: 12 }}>current</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
