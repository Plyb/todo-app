import type { Status } from './db'
import { theme } from './theme'

type StatusModalProps = {
  statuses: Status[]
  currentStatusSlug: string
  onSelect: (slug: string) => void
  onClose: () => void
  title?: string
}

export function StatusModal({ statuses, currentStatusSlug, onSelect, onClose, title = 'Set Status' }: StatusModalProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: theme.colors.overlay,
        zIndex: theme.zIndex.modal,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: theme.radii.xl,
          padding: '8px 0',
          minWidth: 240,
          maxWidth: 360,
          width: '80%',
          boxShadow: theme.shadows.modal,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 4px' }}>
          <span style={{ fontWeight: 600, fontSize: theme.fontSizes.xl }}>{title}</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: theme.fontSizes.xxl, lineHeight: 1, padding: 4 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {statuses.map((status) => (
          <button
            key={status.slug}
            onClick={() => { onSelect(status.slug); onClose() }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: status.slug === currentStatusSlug ? theme.colors.selected : 'none',
              border: 'none',
              padding: '12px 16px',
              cursor: 'pointer',
              fontSize: theme.fontSizes.lg,
              fontWeight: status.slug === currentStatusSlug ? 600 : 400,
            }}
          >
            {status.name}
            {status.slug === currentStatusSlug && (
              <span style={{ marginLeft: 8, color: theme.colors.brand, fontSize: theme.fontSizes.xs }}>current</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
