import { useState } from 'react'
import {
  saveView,
  deleteView,
  createStatus,
  updateStatus,
  deleteStatus,
  getStatusUsage,
  reassignStatus,
  loadStatuses,
  loadTasks,
  loadViews,
  type Status,
  type View,
  type Task,
} from './db'
import { ViewEditorModal } from './ViewEditorModal'
import { StatusEditorModal } from './StatusEditorModal'
import { StatusModal } from './StatusModal'

const loadAutoArchiveSetting = (): string | null => localStorage.getItem('auto-archive-status-slug')
const saveAutoArchiveSetting = (slug: string | null): void => {
  if (slug === null) {
    localStorage.removeItem('auto-archive-status-slug')
  } else {
    localStorage.setItem('auto-archive-status-slug', slug)
  }
}

const loadViewSelectorButtonVisibility = (): string | null => localStorage.getItem('view-selector-button-visibility')
const saveViewSelectorButtonVisibility = (value: string | null): void => {
  if (value === null) {
    localStorage.removeItem('view-selector-button-visibility')
  } else {
    localStorage.setItem('view-selector-button-visibility', value)
  }
}

type SettingsPageProps = {
  onBack: () => void
  statuses: Status[]
  onStatusesChange: (statuses: Status[]) => void
  views: View[]
  onViewsChange: (views: View[]) => void
  onTasksChange: (tasks: Task[]) => void
}

export default function SettingsPage({ onBack, statuses, onStatusesChange, views, onViewsChange, onTasksChange }: SettingsPageProps) {
  const [editingView, setEditingView] = useState<View | null>(null)
  const [editingStatus, setEditingStatus] = useState<Status | null>(null)
  const [reassignFromSlug, setReassignFromSlug] = useState<string | null>(null)
  const [autoArchiveSlug, setAutoArchiveSlug] = useState(loadAutoArchiveSetting)
  const [viewSelectorButtonVisibility, setViewSelectorButtonVisibility] = useState(loadViewSelectorButtonVisibility)

  async function refreshAfterStatusChange() {
    const [newStatuses, newTasks, newViews] = await Promise.all([loadStatuses(), loadTasks(), loadViews()])
    onStatusesChange(newStatuses)
    onTasksChange(newTasks)
    onViewsChange(newViews)
  }

  function handleAutoArchiveChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const slug = e.target.value === '' ? null : e.target.value
    setAutoArchiveSlug(slug)
    saveAutoArchiveSetting(slug)
  }

  function handleViewSelectorButtonVisibilityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value === '' ? null : e.target.value
    setViewSelectorButtonVisibility(value)
    saveViewSelectorButtonVisibility(value)
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

  function handleNewStatus() {
    setEditingStatus({ slug: '', name: '' })
  }

  async function handleSaveStatus(updated: Status) {
    if (!editingStatus) return
    const isNewStatus = !statuses.some((s) => s.slug === editingStatus.slug)
    if (isNewStatus) {
      await createStatus(updated.name, updated.slug)
    } else {
      await updateStatus(editingStatus.slug, updated.slug, updated.name)
    }
    await refreshAfterStatusChange()
    setEditingStatus(null)
  }

  async function handleDeleteStatus(slug: string) {
    if (statuses.length === 1) return
    const usage = await getStatusUsage(slug)
    if (usage.taskIds.length > 0 || usage.viewSlugs.length > 0) {
      setReassignFromSlug(slug)
      return
    }
    await deleteStatus(slug)
    await refreshAfterStatusChange()
  }

  async function handleReassignAndDelete(toSlug: string) {
    if (!reassignFromSlug) return
    await reassignStatus(reassignFromSlug, toSlug)
    await deleteStatus(reassignFromSlug)
    await refreshAfterStatusChange()
    setReassignFromSlug(null)
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

      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Statuses</h2>
          <button
            onClick={handleNewStatus}
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

        {statuses.map((status) => (
          <div key={status.slug} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '12px 16px', borderBottom: '1px solid #eee', boxSizing: 'border-box' }}>
            <button
              onClick={() => setEditingStatus(status)}
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
              {status.name}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteStatus(status.slug) }}
              disabled={statuses.length === 1}
              style={{
                background: 'none',
                border: 'none',
                cursor: statuses.length === 1 ? 'default' : 'pointer',
                fontSize: 16,
                color: '#999',
                padding: '4px 8px',
                opacity: statuses.length === 1 ? 0.4 : 1,
              }}
              aria-label={`Delete ${status.name}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {editingStatus && (
        <StatusEditorModal
          status={editingStatus}
          onSave={handleSaveStatus}
          onClose={() => setEditingStatus(null)}
        />
      )}

      {reassignFromSlug && (
        <StatusModal
          title="Reassign to..."
          statuses={statuses.filter((s) => s.slug !== reassignFromSlug)}
          currentStatusSlug=""
          onSelect={handleReassignAndDelete}
          onClose={() => setReassignFromSlug(null)}
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

      <section style={{ marginTop: 32 }}>
        <label htmlFor="view-selector-button-visibility-select">View selector button</label>
        <select
          id="view-selector-button-visibility-select"
          value={viewSelectorButtonVisibility ?? ''}
          onChange={handleViewSelectorButtonVisibilityChange}
          style={{ marginLeft: 8 }}
        >
          <option value="">Default (hide on iOS PWA)</option>
          <option value="always-show">Always show</option>
          <option value="always-hide">Always hide</option>
        </select>
      </section>
    </main>
  )
}
