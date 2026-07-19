import type { Task, View } from './types'

export function isArchiveEligible(task: Task, todayDateString: string): boolean {
  return task.completedAt !== null && task.completedAt < todayDateString
}

// Reserved slug for the synthetic archive view (see ARCHIVE_VIEW below) - a
// crypto.randomUUID() view slug (SettingsPage.tsx's handleNewView) can never
// collide with this literal string.
export const ARCHIVE_VIEW_SLUG = '__archived__'

// UI-layer-only view: injected into the array passed to ViewModal so it shows
// up in the main page's view selector, but it's never written to the views
// store, so it never appears in SettingsPage's view list.
export const ARCHIVE_VIEW: View = {
  slug: ARCHIVE_VIEW_SLUG,
  name: 'Archive',
  statusSlugs: [],
}

// Validity check for a persisted view slug that accounts for the archive
// view: it's a real, navigable view slug, but it never appears in the `views`
// array loaded from the db, so a plain `views.some(...)` membership check
// would wrongly treat it as stale.
export function isKnownViewSlug(slug: string, views: View[]): boolean {
  return slug === ARCHIVE_VIEW_SLUG || views.some((v) => v.slug === slug)
}

// Most-recently-archived first, tied broken by most-recently-completed, then
// alphabetically. (Newest-first mirrors how archive/trash views elsewhere
// usually surface what you just put away; flip the comparisons below if
// oldest-first turns out to be more useful in practice.)
export function sortArchivedTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.archivedAt !== b.archivedAt) return (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '')
    if (a.completedAt !== b.completedAt) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
    return a.name.localeCompare(b.name)
  })
}
