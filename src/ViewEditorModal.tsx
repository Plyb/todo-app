import { useState } from 'react'
import { type Status, type UserDefinedView } from './types'
import { DraggableList } from './DraggableList'
import { theme } from './theme'
import { Modal } from './ui/Modal'
import { PrimaryButton, SecondaryButton } from './ui/Button'
import { partitionStatuses } from './modal-derivations'

export type ViewEditorModalProps = {
  view: UserDefinedView
  statuses: Status[]
  onSave: (view: UserDefinedView) => void
  onClose: () => void
}

type StatusListItem = { id: number; status: Status }

export function ViewEditorModal({ view, statuses, onSave, onClose }: ViewEditorModalProps) {
  const [name, setName] = useState(view.name)
  const [slugs, setSlugs] = useState<string[]>(view.statusSlugs)

  const { selected: selectedStatuses, unselected: unselectedStatuses } = partitionStatuses(statuses, slugs)

  function toggle(slug: string) {
    setSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  function handleReorderStatuses(draggedId: number, _toSectionIndex: number, insertIndex: number) {
    setSlugs((prev) => {
      const dragged = prev[draggedId]
      const others = prev.filter((_, i) => i !== draggedId)
      return [...others.slice(0, insertIndex), dragged, ...others.slice(insertIndex)]
    })
  }

  const selectedItems: StatusListItem[] = selectedStatuses.map((status, i) => ({ id: i, status }))

  return (
    <Modal
      onClose={onClose}
      variant="editorModal"
      cardStyle={{ padding: 24, minWidth: 300, maxWidth: 400, width: '80%', maxHeight: '80vh', overflowY: 'auto' }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 16 }}>Edit View</h3>
      <label style={{ display: 'block', marginBottom: 16 }}>
        <span style={{ fontSize: theme.fontSizes.md, color: '#555' }}>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            marginTop: 4,
            boxSizing: 'border-box',
            padding: '8px 10px',
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.md,
            fontSize: theme.fontSizes.lg,
          }}
        />
      </label>

      <div style={{ fontWeight: 600, marginBottom: 8 }}>Statuses</div>

      <DraggableList
        sections={[{ items: selectedItems }]}
        onReorder={handleReorderStatuses}
        renderItem={(item) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, width: '100%' }}>
            <input type="checkbox" checked onChange={() => toggle(item.status.slug)} />
            <span style={{ flex: 1 }}>{item.status.name}</span>
          </div>
        )}
      />

      {unselectedStatuses.map((status) => (
        <div
          key={status.slug}
          style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}
        >
          <input type="checkbox" checked={false} onChange={() => toggle(status.slug)} />
          <span style={{ flex: 1, color: theme.colors.textTertiary }}>{status.name}</span>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: theme.space.sm, marginTop: 20 }}>
        <SecondaryButton onClick={onClose}>
          Cancel
        </SecondaryButton>
        <PrimaryButton onClick={() => onSave({ ...view, name: name.trim() || 'Unnamed', statusSlugs: slugs })}>
          Save
        </PrimaryButton>
      </div>
    </Modal>
  )
}
