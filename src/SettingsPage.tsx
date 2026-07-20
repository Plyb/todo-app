import { useState } from 'react'
import type { Status, UserDefinedView, ViewSelectorVisibility } from './types'
import { useStatuses, useViews, useDefaultSource } from './tasks-context'
import { ViewEditorModal } from './ViewEditorModal'
import { StatusEditorModal } from './StatusEditorModal'
import { StatusModal } from './StatusModal'
import { EditableListSection } from './EditableListSection'
import { theme } from './theme'
import { getAutoArchiveEnabled, setAutoArchiveEnabled, useLocalStorageSetting, VIEW_SELECTOR_VISIBILITY_KEY } from './storage'
import { isUserDefinedView } from './synthetic-view-utils'

type SettingsPageProps = {
  onBack: () => void
}

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const { statuses, createStatus, updateStatus, deleteStatus, reassignAndDeleteStatus, getStatusUsage } = useStatuses()
  const { views, saveView, deleteView } = useViews()
  const defaultSource = useDefaultSource()
  const userDefinedViews = views.filter(isUserDefinedView)
  const isNewStatus = (status: Status) => !statuses.some((s) => s.slug === status.slug)
  const [editingView, setEditingView] = useState<UserDefinedView | null>(null)
  const [editingStatus, setEditingStatus] = useState<Status | null>(null)
  const [reassignFromSlug, setReassignFromSlug] = useState<string | null>(null)
  const reassignFromSourceId = statuses.find((s) => s.slug === reassignFromSlug)?.sourceId
  const [autoArchiveEnabled, setAutoArchiveEnabledState] = useState(getAutoArchiveEnabled)
  const [viewSelectorButtonVisibility, setViewSelectorButtonVisibility] = useLocalStorageSetting<Exclude<ViewSelectorVisibility, null>>(VIEW_SELECTOR_VISIBILITY_KEY)

  function handleAutoArchiveChange(e: React.ChangeEvent<HTMLInputElement>) {
    const enabled = e.target.checked
    setAutoArchiveEnabledState(enabled)
    setAutoArchiveEnabled(enabled)
  }

  function handleViewSelectorButtonVisibilityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value === '' ? null : e.target.value
    setViewSelectorButtonVisibility(value as ViewSelectorVisibility)
  }

  async function handleDeleteView(id: string) {
    if (userDefinedViews.length === 1) return
    await deleteView(id)
  }

  async function handleSaveView(view: UserDefinedView) {
    await saveView(view)
    setEditingView(null)
  }

  function handleNewView() {
    const id = crypto.randomUUID()
    setEditingView({ id, name: '', statusSlugs: [] })
  }

  function handleNewStatus() {
    setEditingStatus({ slug: '', name: '', sourceId: defaultSource.id })
  }

  async function handleSaveStatus(updated: Status) {
    if (!editingStatus) return
    if (isNewStatus(editingStatus)) {
      await createStatus(updated.name, updated.slug, updated.sourceId)
    } else {
      await updateStatus(editingStatus.slug, updated.slug, updated.name)
    }
    setEditingStatus(null)
  }

  async function handleDeleteStatus(slug: string) {
    if (statuses.length === 1) return
    const usage = await getStatusUsage(slug)
    if (usage.taskIds.length > 0 || usage.viewIds.length > 0) {
      setReassignFromSlug(slug)
      return
    }
    await deleteStatus(slug)
  }

  async function handleReassignAndDelete(toSlug: string) {
    if (!reassignFromSlug) return
    await reassignAndDeleteStatus(reassignFromSlug, toSlug)
    setReassignFromSlug(null)
  }

  return (
    <main style={{ padding: theme.space.md, minHeight: '100vh' }}>
      <button onClick={onBack} style={{ position: 'fixed', top: 16, left: 16 }}>
        ←
      </button>

      <div style={{ marginTop: 56 }}>
        <EditableListSection
          title="Views"
          items={userDefinedViews}
          getKey={(view) => view.id}
          getLabel={(view) => view.name}
          onEdit={setEditingView}
          onDelete={(view) => handleDeleteView(view.id)}
          onAdd={handleNewView}
          canDelete={(_view, allViews) => allViews.length > 1}
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

      <div style={{ marginTop: 32 }}>
        <EditableListSection
          title="Statuses"
          items={statuses}
          getKey={(status) => status.slug}
          getLabel={(status) => status.name}
          onEdit={setEditingStatus}
          onDelete={(status) => handleDeleteStatus(status.slug)}
          onAdd={handleNewStatus}
          canDelete={(_status, allStatuses) => allStatuses.length > 1}
        />
      </div>

      {editingStatus && (
        <StatusEditorModal
          status={editingStatus}
          isNewStatus={isNewStatus(editingStatus)}
          onSave={handleSaveStatus}
          onClose={() => setEditingStatus(null)}
        />
      )}

      {reassignFromSlug && (
        <StatusModal
          title="Reassign to..."
          statuses={statuses.filter((s) => s.slug !== reassignFromSlug && s.sourceId === reassignFromSourceId)}
          currentStatusSlug=""
          onSelect={handleReassignAndDelete}
          onClose={() => setReassignFromSlug(null)}
        />
      )}

      <section style={{ marginTop: 32 }}>
        <label htmlFor="auto-archive-checkbox">Auto-archive done tasks</label>
        <input id="auto-archive-checkbox" type="checkbox" checked={autoArchiveEnabled} onChange={handleAutoArchiveChange} style={{ marginLeft: 8 }} />
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
