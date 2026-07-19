import type { Task, View } from './types'

export function displayedTasksForView(tasks: Task[], view: View): Task[] {
  return tasks.filter((t) => t.archivedAt === null && view.statusSlugs.includes(t.statusSlug))
}

export function sectionTasksForStatus(tasks: Task[], statusSlug: string): Task[] {
  return tasks.filter((t) => t.archivedAt === null && t.statusSlug === statusSlug)
}
