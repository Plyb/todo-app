import type { Task, View } from './types'

export function displayedTasksForView(tasks: Task[], view: View): Task[] {
  return tasks.filter((t) => t.archivedAt === null && view.statusSlugs.includes(t.statusSlug))
}

export function sectionTasksForStatus(tasks: Task[], statusSlug: string): Task[] {
  return tasks.filter((t) => t.archivedAt === null && t.statusSlug === statusSlug)
}

export type ArchivedTask = Task & { archivedAt: string }

export function sortArchivedTasks(tasks: ArchivedTask[]): ArchivedTask[] {
  return [...tasks].sort((a, b) => {
    if (a.archivedAt !== b.archivedAt) return b.archivedAt.localeCompare(a.archivedAt)
    if (a.completedAt !== b.completedAt) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
    return a.name.localeCompare(b.name)
  })
}
