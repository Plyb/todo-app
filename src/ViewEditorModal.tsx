import { useEffect, useState } from 'react'
import { type Status, type View } from './db'
import { DraggableList } from './DraggableList'

export type ViewEditorModalProps = {
  view: View
  statuses: Status[]
  onSave: (view: View) => void
  onClose: () => void
}

type StatusListItem = { id: number; status: Status }

export function ViewEditorModal({ view, statuses, onSave, onClose }: ViewEditorModalProps) {
  const [name, setName] = useState(view.name)
  const [slugs, setSlugs] = useState<string[]>(view.statusSlugs)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const selectedStatuses = slugs
    .map((s) => statuses.find((st) => st.slug === s))
    .filter((st): st is Status => st !== undefined)
  const unselectedStatuses = statuses.filter((st) => !slugs.includes(st.slug))

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
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 300,
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
          padding: 24,
          minWidth: 300,
          maxWidth: 400,
          width: '80%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Edit View</h3>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 14, color: '#555' }}>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 4,
              boxSizing: 'border-box',
              padding: '8px 10px',
              border: '1px solid #ccc',
              borderRadius: 6,
              fontSize: 15,
            }}
          />
        </label>

        <div style={{ fontWeight: 600, marginBottom: 8 }}>Statuses</div>

        <DraggableList
          sections={[{ items: selectedItems }]}
          onReorder={handleReorderStatuses}
          renderItem={(item) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <input type="checkbox" checked onChange={() => toggle(item.status.slug)} />
              <span style={{ flex: 1 }}>{item.status.name}</span>
            </div>
          )}
        />

        {unselectedStatuses.map((status) => (
          <div
            key={status.slug}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}
          >
            <input type="checkbox" checked={false} onChange={() => toggle(status.slug)} />
            <span style={{ flex: 1, color: '#999' }}>{status.name}</span>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', background: 'none' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ ...view, name: name.trim() || 'Unnamed', statusSlugs: slugs })}
            style={{ padding: '8px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
