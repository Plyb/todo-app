import { theme } from './theme'

type EditableListSectionProps<T> = {
  title: string
  items: T[]
  getKey: (item: T) => string | number
  getLabel: (item: T) => string
  onEdit: (item: T) => void
  onDelete: (item: T) => void
  onAdd: () => void
  canDelete: (item: T, items: T[]) => boolean
}

export function EditableListSection<T>({ title, items, getKey, getLabel, onEdit, onDelete, onAdd, canDelete }: EditableListSectionProps<T>) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
        <button
          onClick={onAdd}
          style={{
            background: theme.colors.brand,
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: 32,
            height: 32,
            cursor: 'pointer',
            fontSize: 20,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          +
        </button>
      </div>

      {items.map((item) => {
        const disabled = !canDelete(item, items)
        return (
          <div key={getKey(item)} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '12px 16px', borderBottom: `1px solid ${theme.colors.divider}`, boxSizing: 'border-box' }}>
            <button
              onClick={() => onEdit(item)}
              style={{
                flex: 1,
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: theme.fontSizes.xl,
                padding: 0,
              }}
            >
              {getLabel(item)}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(item) }}
              disabled={disabled}
              style={{
                background: 'none',
                border: 'none',
                cursor: disabled ? 'default' : 'pointer',
                fontSize: theme.fontSizes.xl,
                color: theme.colors.textTertiary,
                padding: '4px 8px',
                opacity: disabled ? 0.4 : 1,
              }}
              aria-label={`Delete ${getLabel(item)}`}
            >
              ✕
            </button>
          </div>
        )
      })}
    </>
  )
}
