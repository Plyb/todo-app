import type { Task } from './types'

// A task is only eligible for auto-archiving once at least one full calendar
// day has elapsed since it was marked done (issue #167) - same-day completions
// must wait. completedAt/todayDateString are both 'YYYY-MM-DD', so a plain
// string comparison is enough to detect that todayDateString is a later day.
export function isArchiveEligible(task: Task, todayDateString: string): boolean {
  return task.completedAt !== null && task.completedAt < todayDateString
}
