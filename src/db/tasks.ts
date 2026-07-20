import { LexoRank } from 'lexorank'
import { z } from 'zod'
import { byRank } from '../rank-utils'
import { sortArchivedTasks } from '../view-utils'
import type { ArchivedTask } from '../types'
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

function parseTaskAt(cursor: IDBCursorWithValue): Task {
  return { id: keyToTaskId(cursor.primaryKey), ...storedTaskSchema.parse(cursor.value) }
}

async function ensureSeeded(): Promise<void> {
  const count = await withStore(TASKS_STORE, 'readonly', (store) => requestToPromise(store.count()))
  if (count > 0) return

  const db = await openTasksDatabase()
  await seedDemoTasks(db)
}

// Only used in tests. May refactor the tests later to not use it.
export async function loadTasks(): Promise<Task[]> {
  await ensureSeeded()
  const tasks = await readTasks()
  tasks.sort(byRank)
  return tasks
}

// One status section's page, sorted the same way as the rest of the app
// (byRank), reading only this status's own share of TASKS_STORE via the
// by_status_rank index rather than every task in the store.
export async function loadTaskPageForStatus(
  statusSlug: string,
  offset: number,
  limit: number = TASK_PAGE_SIZE
): Promise<TaskPage<Task>> {
  await ensureSeeded()
  return withStore(TASKS_STORE, 'readonly', async (store) => {
    // The standard IndexedDB idiom for "every compound key starting with
    // statusSlug": a shorter array key sorts before any longer one sharing the
    // same prefix, and '\uffff' sorts after any realistic rank string, so this
    // bounds the walk to exactly this status's rank-ordered range.
    const range = IDBKeyRange.bound([statusSlug, ''], [statusSlug, '\uffff'])
    const gathered: Task[] = []
    let skipped = 0

    await iterateCursor(
      store,
      (cursor) => {
        const task = parseTaskAt(cursor)
        // Archived tasks keep their statusSlug (see isArchiveEligible/setArchived),
        // so they still fall in this range - skipped here rather than via the
        // index itself, since a compound key can't exclude them without also
        // excluding every active task (their archivedAt is null, an invalid
        // IDB key, which invalidates the whole compound key if included in it).
        if (task.archivedAt !== null) return
        if (skipped < offset) {
          skipped++
          return
        }
        gathered.push(task)
      },
      {
        index: 'by_status_rank',
        range,
        // Stop one record past the page: enough to know whether there's a
        // next page, without a second query or reading past this range.
        shouldBreak: () => gathered.length > limit,
      },
    )

    return { tasks: gathered.slice(0, limit), hasMore: gathered.length > limit }
  })
}

// The archived view's page, sorted by sortArchivedTasks (archivedAt desc, then
// completedAt desc, then name) via the by_archivedAt index, which already
// contains only archived tasks (see migrateAddTaskIndices) in archivedAt order.
export async function loadArchivedTaskPage(
  offset: number,
  limit: number = TASK_PAGE_SIZE
): Promise<TaskPage<ArchivedTask>> {
  await ensureSeeded()
  return withStore(TASKS_STORE, 'readonly', async (store) => {
    const needed = offset + limit + 1
    const gathered: ArchivedTask[] = []
    // Same-archivedAt tasks (e.g. a batch the daily auto-archive scan
    // archives together) need every one of that day's records present to
    // tie-break correctly by completedAt/name - so they're buffered per
    // same-key cohort and only flushed (sorted, counted toward the page) once
    // a *different* archivedAt confirms the cohort is complete, rather than
    // sorting the whole archived set up front.
    let cohort: ArchivedTask[] = []
    let cohortKey: string | null = null

    function flushCohort(): void {
      if (cohort.length === 0) return
      gathered.push(...sortArchivedTasks(cohort))
      cohort = []
    }

    await iterateCursor(
      store,
      (cursor) => {
        cohort.push(parseTaskAt(cursor) as ArchivedTask)
      },
      {
        index: 'by_archivedAt',
        direction: 'prev',
        shouldBreak: (cursor) => {
          const nextKey = cursor.key as string
          if (cohortKey !== null && nextKey !== cohortKey) {
            flushCohort()
          }
          cohortKey = nextKey
          return gathered.length >= needed
        },
      },
    )
    flushCohort()

    return { tasks: gathered.slice(offset, offset + limit), hasMore: gathered.length > offset + limit }
  })
}

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
