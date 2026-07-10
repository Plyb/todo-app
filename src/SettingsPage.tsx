import { useState } from 'react'
import { saveView, deleteView, type Status, type View } from './db'
import { ViewEditorModal } from './ViewEditorModal'

type SettingsPageProps = {
  onBack: () => void
  statuses: Status[]
  views: View[]
  onViewsChange: (views: View[]) => void
}

export default function SettingsPage({ onBack, statuses, views, onViewsChange }: SettingsPageProps) {
  const [editingView, setEditingView] = useState<View | null>(null)

  async function handleDeleteView(slug: string) {
    if (views.length === 1) return
    await deleteView(slug)
    onViewsChange(views.filter((v) => v.slug !== slug))
  }

  async function handleSaveView(view: View) {
    await saveView(view)
    if (views.some((v) => v.slug === view.slug)) {
      onViewsChange(views.map((v) => (v.slug === view.slug ? view : v)))
    } else {
      onViewsChange([...views, view])
    }
    setEditingView(null)
  }

  function handleNewView() {
    const slug = crypto.randomUUID()
    setEditingView({ slug, name: '', statusSlugs: [] })
  }

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

        {views.map((view) => (
          <div key={view.slug} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '12px 16px', borderBottom: '1px solid #eee', boxSizing: 'border-box' }}>
            <button
              onClick={() => setEditingView(view)}
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
              {view.name}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteView(view.slug) }}
              disabled={views.length === 1}
              style={{
                background: 'none',
                border: 'none',
                cursor: views.length === 1 ? 'default' : 'pointer',
                fontSize: 16,
                color: '#999',
                padding: '4px 8px',
                opacity: views.length === 1 ? 0.4 : 1,
              }}
              aria-label={`Delete ${view.name}`}
            >
              ✕
            </button>
          </div>
        ))}
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
