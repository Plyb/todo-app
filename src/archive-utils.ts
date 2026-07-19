import type { Task, View } from './types'

export function isArchiveEligible(task: Task, todayDateString: string): boolean {
  return task.completedAt !== null && task.completedAt < todayDateString
}

export const ARCHIVE_VIEW_SLUG = '__archived__'

export const ARCHIVE_VIEW: View = {
  slug: ARCHIVE_VIEW_SLUG,
  name: 'Archive',
  statusSlugs: [],
}

export function isKnownViewSlug(slug: string, views: View[]): boolean {
  return slug === ARCHIVE_VIEW_SLUG || views.some((v) => v.slug === slug)
}

export function sortArchivedTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.archivedAt !== b.archivedAt) return (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '')
    if (a.completedAt !== b.completedAt) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
    return a.name.localeCompare(b.name)
  })
}
