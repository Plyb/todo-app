import type { Task } from './types'

export function isArchiveEligible(task: Task, todayDateString: string): boolean {
  return task.completedAt !== null && task.completedAt < todayDateString
}
