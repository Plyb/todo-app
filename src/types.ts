export type Status = {
  slug: string
  name: string
}

export type Task = {
  id: number
  name: string
  completedAt: string | null  // ISO date string 'YYYY-MM-DD' the task was marked done, or null if not done
  archivedAt: string | null  // ISO date string 'YYYY-MM-DD' the task was archived, or null if not archived
  rank: string
  statusSlug: string
  notes: string
}

export type SubtaskLink = { id: number; parentTaskId: number; childTaskId: number; rank: string }

export type BlockingRelationship = { id: number; fromTaskId: number; toTaskId: number; type: 'blocks' }

export type UserDefinedView = {
  id: string
  name: string
  statusSlugs: string[]
}

export type ArchivedView = {
  id: '__archived__'
  name: string
}

export type View = UserDefinedView | ArchivedView

export type ScheduledTransition = {
  id: number
  taskId: number
  date: string  // ISO date string 'YYYY-MM-DD'
  statusSlug: string
}

export type ViewSelectorVisibility = 'always-show' | 'always-hide' | null
