import { theme } from '../theme'
import { Modal } from './Modal'

type SelectListModalProps<T> = {
  items: T[]
  getKey: (item: T) => string | number
  getLabel: (item: T) => string
  isCurrent: (item: T) => boolean
  title: string
  onSelect: (item: T) => void
  onClose: () => void
}

export function SelectListModal<T>({ items, getKey, getLabel, isCurrent, title, onSelect, onClose }: SelectListModalProps<T>) {
  return (
    <Modal onClose={onClose} cardStyle={{ padding: '8px 0', minWidth: 240, maxWidth: 360, width: '80%' }}>
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

      {items.map((item) => (
        <button
          key={getKey(item)}
          onClick={() => { onSelect(item); onClose() }}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: isCurrent(item) ? theme.colors.selected : 'none',
            border: 'none',
            padding: '12px 16px',
            cursor: 'pointer',
            fontSize: theme.fontSizes.lg,
            fontWeight: isCurrent(item) ? 600 : 400,
          }}
        >
          {getLabel(item)}
          {isCurrent(item) && (
            <span style={{ marginLeft: 8, color: theme.colors.brand, fontSize: theme.fontSizes.xs }}>current</span>
          )}
        </button>
      ))}
    </Modal>
  )
}
