import type { Task, View } from './types'

// Archived tasks are no longer considered part of their status, so a normal
// (status-slug-based) view's task lists exclude them once archivedAt is set.
export function displayedTasksForView(tasks: Task[], view: View): Task[] {
  return tasks.filter((t) => t.archivedAt === null && view.statusSlugs.includes(t.statusSlug))
}

export function sectionTasksForStatus(tasks: Task[], statusSlug: string): Task[] {
  return tasks.filter((t) => t.archivedAt === null && t.statusSlug === statusSlug)
}
