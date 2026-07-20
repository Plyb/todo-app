import { isArchivedTask, type ArchivedTask, type Task, type UserDefinedView } from './types'

export function displayedTasksForView(tasks: Task[], view: UserDefinedView): Task[] {
  return tasks.filter((t) => t.archivedAt === null && view.statusSlugs.includes(t.statusSlug))
}

export function sectionTasksForStatus(tasks: Task[], statusSlug: string): Task[] {
  return tasks.filter((t) => t.archivedAt === null && t.statusSlug === statusSlug)
}

export function archivedTasksOf(tasks: Task[]): ArchivedTask[] {
  return tasks.filter(isArchivedTask)
}

export function sortArchivedTasks(tasks: ArchivedTask[]): ArchivedTask[] {
  return [...tasks].sort((a, b) => {
    if (a.archivedAt !== b.archivedAt) return b.archivedAt.localeCompare(a.archivedAt)
    if (a.completedAt !== b.completedAt) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
    return a.name.localeCompare(b.name)
  })
}

export type SectionPagingInfo = { offset: number; isLoading: boolean; hasMore: boolean }

export const DEFAULT_SECTION_PAGING: SectionPagingInfo = { offset: 0, isLoading: false, hasMore: true }
