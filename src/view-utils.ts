import { isArchivedTask, type ArchivedTask, type ArchivedView, type StatusRef, type Task, type UserDefinedView } from './types'

export function displayedTasksForView(tasks: Task[], view: UserDefinedView): Task[] {
  return tasks.filter(
    (t) => t.archivedAt === null && view.statusRefs.some((ref) => ref.slug === t.statusSlug && ref.sourceId === t.sourceId)
  )
}

export function sectionTasksForStatus(tasks: Task[], ref: StatusRef): Task[] {
  return tasks.filter((t) => t.archivedAt === null && t.statusSlug === ref.slug && t.sourceId === ref.sourceId)
}

export function archivedTasksOf(tasks: Task[]): ArchivedTask[] {
  return tasks.filter(isArchivedTask)
}

export function sortArchivedTasks<T extends { archivedAt: string; completedAt: string | null; name: string }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.archivedAt !== b.archivedAt) return b.archivedAt.localeCompare(a.archivedAt)
    if (a.completedAt !== b.completedAt) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
    return a.name.localeCompare(b.name)
  })
}

export type SectionPagingInfo = { offset: number; isLoading: boolean; hasMore: boolean }

export const DEFAULT_SECTION_PAGING: SectionPagingInfo = { offset: 0, isLoading: false, hasMore: true }

// Identifies one section's page-request target: either a real (source-scoped)
// status, or the synthetic archive view's sentinel id.
export type SectionRef = StatusRef | ArchivedView['id']

// Composite so two sources' same-named status slug don't collide in
// sectionPaging's keys once a view's statuses can span multiple sources.
export function sectionPagingKey(section: SectionRef): string {
  return typeof section === 'string' ? section : `${section.sourceId}:${section.slug}`
}
