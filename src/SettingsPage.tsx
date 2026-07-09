import { useState } from 'react'
import { saveView, deleteView, type Status, type View } from './db'
import { DraggableList } from './DraggableList'

type SettingsPageProps = {
  onBack: () => void
  statuses: Status[]
  views: View[]
  onViewsChange: (views: View[]) => void
}

type ViewEditorModalProps = {
  view: View
  statuses: Status[]
  onSave: (view: View) => void
  onClose: () => void
}

function ViewEditorModal({ view, statuses, onSave, onClose }: ViewEditorModalProps) {
  const [name, setName] = useState(view.name)
  const [slugs, setSlugs] = useState<string[]>(view.statusSlugs)

  const selectedStatuses = slugs
    .map((s) => statuses.find((st) => st.slug === s))
    .filter((st): st is Status => st !== undefined)
  const unselectedStatuses = statuses.filter((st) => !slugs.includes(st.slug))

  function toggle(slug: string) {
    setSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  function moveUp(slug: string) {
    const idx = slugs.indexOf(slug)
    if (idx <= 0) return
    const next = [...slugs]
    const a = next[idx - 1]; next[idx - 1] = next[idx]; next[idx] = a
    setSlugs(next)
  }

  function moveDown(slug: string) {
    const idx = slugs.indexOf(slug)
    if (idx === -1 || idx >= slugs.length - 1) return
    const next = [...slugs]
    const a = next[idx + 1]; next[idx + 1] = next[idx]; next[idx] = a
    setSlugs(next)
  }

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

        {selectedStatuses.map((status, idx) => (
          <div
            key={status.slug}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}
          >
            <input type="checkbox" checked onChange={() => toggle(status.slug)} />
            <span style={{ flex: 1 }}>{status.name}</span>
            <button
              onClick={() => moveUp(status.slug)}
              disabled={idx === 0}
              style={{ border: 'none', background: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, fontSize: 14 }}
            >
              ▲
            </button>
            <button
              onClick={() => moveDown(status.slug)}
              disabled={idx === slugs.length - 1}
              style={{ border: 'none', background: 'none', cursor: idx === slugs.length - 1 ? 'default' : 'pointer', opacity: idx === slugs.length - 1 ? 0.3 : 1, fontSize: 14 }}
            >
              ▼
            </button>
          </div>
        ))}

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

type ViewListItem = { id: number; view: View }

export default function SettingsPage({ onBack, statuses, views, onViewsChange }: SettingsPageProps) {
  const [editingView, setEditingView] = useState<View | null>(null)

  async function handleDeleteView(id: string) {
    await deleteView(id)
    onViewsChange(views.filter((v) => v.id !== id))
  }

  async function handleSaveView(view: View) {
    await saveView(view)
    if (views.some((v) => v.id === view.id)) {
      onViewsChange(views.map((v) => (v.id === view.id ? view : v)))
    } else {
      onViewsChange([...views, view])
    }
    setEditingView(null)
  }

  function handleNewView() {
    const id = crypto.randomUUID()
    setEditingView({ id, slug: id, name: '', statusSlugs: [] })
  }

  async function handleReorderViews(draggedId: number, insertIndex: number) {
    const others = views.filter((_, i) => i !== draggedId)
    const dragged = views[draggedId]
    const reordered = [...others.slice(0, insertIndex), dragged, ...others.slice(insertIndex)]
    onViewsChange(reordered)
    for (const view of reordered) {
      await saveView(view)
    }
  }

  const viewListItems: ViewListItem[] = views.map((view, i) => ({ id: i, view }))

  return (
    <main style={{ padding: 16, minHeight: '100vh' }}>
      <button onClick={onBack} style={{ position: 'fixed', top: 16, left: 16 }}>
        ←
      </button>

      <div style={{ marginTop: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Views</h2>
          <button
            onClick={handleNewView}
            style={{
              background: '#1a73e8',
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

        <DraggableList
          items={viewListItems}
          onReorder={handleReorderViews}
          renderItem={(item) => (
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <button
                onClick={() => setEditingView(item.view)}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: 0,
                }}
              >
                {item.view.name}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteView(item.view.id) }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 16,
                  color: '#999',
                  padding: '4px 8px',
                }}
                aria-label={`Delete ${item.view.name}`}
              >
                ✕
              </button>
            </div>
          )}
        />
      </div>

      {editingView && (
        <ViewEditorModal
          view={editingView}
          statuses={statuses}
          onSave={handleSaveView}
          onClose={() => setEditingView(null)}
        />
      )}
    </main>
  )
}
