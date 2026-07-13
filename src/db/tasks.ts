import { LexoRank } from 'lexorank'
import { z } from 'zod'
import { byRank } from '../rank-utils'
import {
  RELATIONSHIPS_STORE,
  SUBTASKS_STORE,
  TASKS_STORE,
  getAllWithIds,
  keyToTaskId,
  openTasksDatabase,
  patchRecordById,
  requestToPromise,
  seedDemoTasks,
  withDefault,
  withStore,
  withTransaction,
  type StoredTask,
  type Task,
} from './client'
import { deleteBlocksByTaskInStore } from './blocks'
import { deleteSubtaskLinksByChildInStore, deleteSubtaskLinksByParentInStore } from './subtasks'

const storedTaskSchema = z.object({
  name: z.string(),
  done: withDefault(z.boolean(), () => false),
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

export async function loadTasks(): Promise<Task[]> {
  const tasks = await readTasks()
  if (tasks.length > 0) {
    tasks.sort(byRank)
    return tasks
  }

  const db = await openTasksDatabase()
  await seedDemoTasks(db)
  const seededTasks = await readTasks()
  seededTasks.sort(byRank)
  return seededTasks
}

export async function createTask(name: string, rank: string, statusSlug: string = 'backlog'): Promise<Task> {
  const key = await withStore(TASKS_STORE, 'readwrite', (store) =>
    requestToPromise(store.add({ name, done: false, rank, statusSlug, notes: '' })),
  )
  return { id: keyToTaskId(key), name, done: false, rank, statusSlug, notes: '' }
}

export async function saveTask(task: Task): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', (store) => {
    store.put({ name: task.name, done: task.done, rank: task.rank, statusSlug: task.statusSlug, notes: task.notes }, task.id)
  })
}

export async function updateTaskDone(id: number, done: boolean): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', (store) => patchRecordById<StoredTask>(store, id, { done }))
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
