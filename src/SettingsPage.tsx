import { useState } from 'react'
import { saveView, deleteView, type Status, type View } from './db'
import { ViewEditorModal } from './ViewEditorModal'

const loadAutoArchiveSetting = (): string | null => localStorage.getItem('auto-archive-status-slug')
const saveAutoArchiveSetting = (slug: string | null): void => {
  if (slug === null) {
    localStorage.removeItem('auto-archive-status-slug')
  } else {
    localStorage.setItem('auto-archive-status-slug', slug)
  }
}

type SettingsPageProps = {
  onBack: () => void
  statuses: Status[]
  views: View[]
  onViewsChange: (views: View[]) => void
}

export default function SettingsPage({ onBack, statuses, views, onViewsChange }: SettingsPageProps) {
  const [editingView, setEditingView] = useState<View | null>(null)
  const [autoArchiveSlug, setAutoArchiveSlug] = useState(loadAutoArchiveSetting)

  function handleAutoArchiveChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const slug = e.target.value === '' ? null : e.target.value
    setAutoArchiveSlug(slug)
    saveAutoArchiveSetting(slug)
  }

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

      <section style={{ marginTop: 32 }}>
        <label htmlFor="auto-archive-select">Auto-archive done tasks</label>
        <select id="auto-archive-select" value={autoArchiveSlug ?? ''} onChange={handleAutoArchiveChange} style={{ marginLeft: 8 }}>
          <option value="">None</option>
          {statuses.map(s => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
      </section>
    </main>
  )
}
