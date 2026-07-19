import type { Task, UserDefinedView } from './types'

export function displayedTasksForView(tasks: Task[], view: UserDefinedView): Task[] {
  return tasks.filter((t) => t.archivedAt === null && view.statusSlugs.includes(t.statusSlug))
}

export function sectionTasksForStatus(tasks: Task[], statusSlug: string): Task[] {
  return tasks.filter((t) => t.archivedAt === null && t.statusSlug === statusSlug)
}

export type ArchivedTask = Task & { archivedAt: string }

export function archivedTasksOf(tasks: Task[]): ArchivedTask[] {
  return tasks.filter((t): t is ArchivedTask => t.archivedAt !== null)
}

export function sortArchivedTasks(tasks: ArchivedTask[]): ArchivedTask[] {
  return [...tasks].sort((a, b) => {
    if (a.archivedAt !== b.archivedAt) return b.archivedAt.localeCompare(a.archivedAt)
    if (a.completedAt !== b.completedAt) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
    return a.name.localeCompare(b.name)
  })
}

// Per-section lazy-loading state (issue #249), keyed by statusSlug for a
// normal view's sections or by ARCHIVE_VIEW_SLUG for the archived view.
export type SectionPagingInfo = { offset: number; isLoading: boolean; hasMore: boolean }

// A section that hasn't been requested yet: treated as "has a first page
// still to load" so it renders a loading placeholder until requested.
export const DEFAULT_SECTION_PAGING: SectionPagingInfo = { offset: 0, isLoading: false, hasMore: true }
