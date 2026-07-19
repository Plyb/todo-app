import type { Task } from './types'

export function isArchiveEligible(task: Task, todayDateString: string): boolean {
  return task.completedAt !== null && task.completedAt < todayDateString
}

export function sortArchivedTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.archivedAt !== b.archivedAt) return (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '')
    if (a.completedAt !== b.completedAt) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
    return a.name.localeCompare(b.name)
  })
}
