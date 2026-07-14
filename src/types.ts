export type Status = {
  slug: string
  name: string
}

export type Task = {
  id: number
  name: string
  done: boolean
  rank: string
  statusSlug: string
  notes: string
}

export type SubtaskLink = { id: number; parentTaskId: number; childTaskId: number; rank: string }

export type BlockingRelationship = { id: number; fromTaskId: number; toTaskId: number; type: 'blocks' }

export type View = {
  slug: string
  name: string
  statusSlugs: string[]
}

export type ScheduledTransition = {
  id: number
  taskId: number
  date: string  // ISO date string 'YYYY-MM-DD'
  statusSlug: string
}

export type ViewSelectorVisibility = 'always-show' | 'always-hide' | null
