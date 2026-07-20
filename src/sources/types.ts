import { z } from 'zod'
import type {
  ArchivedTask,
  BlockingRelationship,
  ScheduledTransition,
  Status,
  SubtaskLink,
  Task,
} from '../types'
import type { StatusUsage, TaskPage } from '../db'

// The interface every task source implements. It covers the per-source types
// (tasks, statuses, relationships, subtasks, scheduled transitions) and mirrors
// the functions in db/*.ts, one method per consumer-facing operation. Views are
// app-level (not per-source) and are deliberately absent. IndexedDB-only escape
// hatches (the *InStore helpers, the test-only loadTasks) stay implementation
// details of the IndexedDB source rather than surfacing here.
export type TaskSource = {
  id: string

  loadTaskPageForStatus: (statusSlug: string, offset: number, limit?: number) => Promise<TaskPage<Task>>
  loadArchivedTaskPage: (offset: number, limit?: number) => Promise<TaskPage<ArchivedTask>>
  loadTasksByIds: (ids: number[]) => Promise<Task[]>
  createTask: (name: string, rank: string, statusSlug?: string) => Promise<Task>
  saveTask: (task: Task) => Promise<void>
  updateTaskCompletedAt: (id: number, completedAt: string | null) => Promise<void>
  updateTaskArchivedAt: (id: number, archivedAt: string | null) => Promise<void>
  updateTaskRank: (id: number, rank: string) => Promise<void>
  updateTaskName: (id: number, name: string) => Promise<void>
  updateTaskNotes: (id: number, notes: string) => Promise<void>
  updateTaskStatus: (id: number, statusSlug: string) => Promise<void>
  deleteTask: (id: number) => Promise<void>

  loadStatuses: () => Promise<Status[]>
  createStatus: (name: string, slug: string) => Promise<Status>
  updateStatus: (oldSlug: string, newSlug: string, newName: string) => Promise<void>
  deleteStatus: (slug: string) => Promise<void>
  getStatusUsage: (slug: string) => Promise<StatusUsage>
  isStatusInUse: (slug: string) => Promise<boolean>
  reassignStatus: (fromSlug: string, toSlug: string) => Promise<void>

  loadBlocks: (taskId: number) => Promise<BlockingRelationship[]>
  loadAllBlocks: () => Promise<BlockingRelationship[]>
  addBlock: (fromTaskId: number, toTaskId: number, type: 'blocks') => Promise<BlockingRelationship>
  deleteBlock: (id: number) => Promise<void>
  deleteBlocksByTask: (taskId: number) => Promise<void>

  loadSubtaskLinks: (parentTaskId: number) => Promise<SubtaskLink[]>
  loadParentLink: (childTaskId: number) => Promise<SubtaskLink | undefined>
  loadAllSubtaskLinks: () => Promise<SubtaskLink[]>
  createSubtaskLink: (parentTaskId: number, childTaskId: number, rank: string) => Promise<SubtaskLink>
  updateSubtaskLinkRank: (id: number, rank: string) => Promise<void>
  deleteSubtaskLinksByParent: (parentTaskId: number) => Promise<void>
  deleteSubtaskLinksByChild: (childTaskId: number) => Promise<void>

  loadScheduledTransitions: (taskId: number) => Promise<ScheduledTransition[]>
  addScheduledTransition: (taskId: number, date: string, statusSlug: string) => Promise<ScheduledTransition>
  deleteScheduledTransition: (id: number) => Promise<void>
  loadAllDueTransitions: () => Promise<ScheduledTransition[]>
}

// Discriminated union of source configurations. Every member has at least a
// `kind` and an `id`; only the IndexedDB source exists for now.
export type IndexedDbSourceConfiguration = {
  kind: 'indexeddb'
  id: string
}

export type SourceConfiguration = IndexedDbSourceConfiguration

export const sourceConfigurationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('indexeddb'), id: z.string() }),
]) satisfies z.ZodType<SourceConfiguration>
