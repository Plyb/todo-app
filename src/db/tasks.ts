import { LexoRank } from 'lexorank'
import { z } from 'zod'
import { byRank } from '../rank-utils'
import { archivedTasksOf, sortArchivedTasks, type ArchivedTask } from '../view-utils'
import {
  RELATIONSHIPS_STORE,
  SUBTASKS_STORE,
  TASKS_STORE,
  getAllWithIds,
  iterateCursor,
  keyToTaskId,
  openTasksDatabase,
  patchRecordById,
  requestToPromise,
  seedDemoTasks,
  withDefault,
  withStore,
  withTransaction,
  type StoredTask,
} from './client'
import type { Task } from '../types'
import { deleteBlocksByTaskInStore } from './blocks'
import { deleteSubtaskLinksByChildInStore, deleteSubtaskLinksByParentInStore } from './subtasks'

// The default page size for lazily-loaded sections (issue #249): a section
// loads this many tasks initially, then this many more per scroll-triggered page.
export const TASK_PAGE_SIZE = 20

export type TaskPage<T> = { tasks: T[]; hasMore: boolean }

const storedTaskSchema = z.object({
  name: z.string(),
  completedAt: withDefault(z.string().nullable(), () => null),
  archivedAt: withDefault(z.string().nullable(), () => null),
  rank: withDefault(z.string(), () => LexoRank.middle().toString()),
  statusSlug: withDefault(z.string(), () => 'backlog'),
  notes: withDefault(z.string(), () => ''),
}) satisfies z.ZodType<StoredTask>

async function readTasks(): Promise<Task[]> {
  return withStore(TASKS_STORE, 'readonly', async (store) => {
    const tasks = await getAllWithIds<Record<string, unknown>>(store)
    return tasks.map(({ id, ...raw }) => ({ id, ...storedTaskSchema.parse(raw) }))
  })
}

// Cursor pass (rather than getAllWithIds's bulk getAll+getAllKeys) so a
// section's paginated read only materializes the tasks it actually needs,
// not every record in the store.
async function readMatchingTasks(matches: (task: Task) => boolean): Promise<Task[]> {
  return withStore(TASKS_STORE, 'readonly', async (store) => {
    const results: Task[] = []
    await iterateCursor(store, (cursor) => {
      const task = { id: keyToTaskId(cursor.key), ...storedTaskSchema.parse(cursor.value) }
      if (matches(task)) results.push(task)
    })
    return results
  })
}

function paginate<T>(sorted: T[], offset: number, limit: number): TaskPage<T> {
  return { tasks: sorted.slice(offset, offset + limit), hasMore: offset + limit < sorted.length }
}

// A brand-new database has no tasks at all; every reader (the full load and
// every paginated section read) needs the demo tasks seeded before it runs,
// not just the old startup-only loadTasks path.
async function ensureSeeded(): Promise<void> {
  const count = await withStore(TASKS_STORE, 'readonly', (store) => requestToPromise(store.count()))
  if (count > 0) return

  const db = await openTasksDatabase()
  await seedDemoTasks(db)
}

export async function loadTasks(): Promise<Task[]> {
  await ensureSeeded()
  const tasks = await readTasks()
  tasks.sort(byRank)
  return tasks
}

// One status section's page, sorted the same way as the rest of the app
// (byRank) - matches sectionTasksForStatus's filtering, just bounded to a page.
export async function loadTaskPageForStatus(
  statusSlug: string,
  offset: number,
  limit: number = TASK_PAGE_SIZE
): Promise<TaskPage<Task>> {
  await ensureSeeded()
  const matching = await readMatchingTasks((t) => t.archivedAt === null && t.statusSlug === statusSlug)
  matching.sort(byRank)
  return paginate(matching, offset, limit)
}

// The archived view's page, sorted by sortArchivedTasks (archivedAt, then
// completedAt, then name) rather than byRank - the archive view's own order.
export async function loadArchivedTaskPage(
  offset: number,
  limit: number = TASK_PAGE_SIZE
): Promise<TaskPage<ArchivedTask>> {
  await ensureSeeded()
  const matching = await readMatchingTasks((t) => t.archivedAt !== null)
  const sorted = sortArchivedTasks(archivedTasksOf(matching))
  return paginate(sorted, offset, limit)
}

// Targeted point-lookup re-read, used to resync only the tasks a caller
// already holds in memory (e.g. after a failed write, or to check a scheduled
// transition's task still exists) without loading the rest of the store.
export async function loadTasksByIds(ids: number[]): Promise<Task[]> {
  return withStore(TASKS_STORE, 'readonly', async (store) => {
    const results: Task[] = []
    for (const id of ids) {
      const raw = (await requestToPromise(store.get(id))) as Record<string, unknown> | undefined
      if (raw !== undefined) results.push({ id, ...storedTaskSchema.parse(raw) })
    }
    return results
  })
}

export async function createTask(name: string, rank: string, statusSlug: string = 'backlog'): Promise<Task> {
  const key = await withStore(TASKS_STORE, 'readwrite', (store) =>
    requestToPromise(store.add({ name, completedAt: null, archivedAt: null, rank, statusSlug, notes: '' })),
  )
  return { id: keyToTaskId(key), name, completedAt: null, archivedAt: null, rank, statusSlug, notes: '' }
}

export async function saveTask(task: Task): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', (store) => {
    store.put(
      { name: task.name, completedAt: task.completedAt, archivedAt: task.archivedAt, rank: task.rank, statusSlug: task.statusSlug, notes: task.notes },
      task.id,
    )
  })
}

export async function updateTaskCompletedAt(id: number, completedAt: string | null): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', (store) => patchRecordById<StoredTask>(store, id, { completedAt }))
}

export async function updateTaskArchivedAt(id: number, archivedAt: string | null): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', (store) => patchRecordById<StoredTask>(store, id, { archivedAt }))
}

export async function updateTaskRank(id: number, rank: string): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', (store) => patchRecordById<StoredTask>(store, id, { rank }))
}

export async function updateTaskName(id: number, name: string): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', (store) => patchRecordById<StoredTask>(store, id, { name }))
}

export async function updateTaskNotes(id: number, notes: string): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', (store) => patchRecordById<StoredTask>(store, id, { notes }))
}

export async function updateTaskStatus(id: number, statusSlug: string): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', (store) => patchRecordById<StoredTask>(store, id, { statusSlug }))
}

export async function deleteTask(id: number): Promise<void> {
  await withTransaction([TASKS_STORE, SUBTASKS_STORE, RELATIONSHIPS_STORE], 'readwrite', async (tx) => {
    tx.objectStore(TASKS_STORE).delete(id)
    // The deleted task may have been a parent (its links to children are removed,
    // children survive as independent tasks) and/or a child (its own link is removed).
    const subtasksStore = tx.objectStore(SUBTASKS_STORE)
    await deleteSubtaskLinksByParentInStore(subtasksStore, id)
    await deleteSubtaskLinksByChildInStore(subtasksStore, id)
    await deleteBlocksByTaskInStore(tx.objectStore(RELATIONSHIPS_STORE), id)
  })
}
