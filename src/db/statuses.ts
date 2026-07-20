import { z } from 'zod'
import {
  STATUSES_STORE,
  TASKS_STORE,
  VIEWS_STORE,
  getAllWithIds,
  iterateCursor,
  requestToPromise,
  withStore,
  withTransaction,
  type StoredTask,
  type WithoutSource,
} from './client'
import type { Status, UserDefinedView } from '../types'

const statusSchema = z.object({
  slug: z.string(),
  name: z.string(),
}) satisfies z.ZodType<WithoutSource<Status>>

export async function loadStatuses(): Promise<WithoutSource<Status>[]> {
  return withStore(STATUSES_STORE, 'readonly', async (store) => {
    const raw = await requestToPromise(store.getAll())
    return raw.map((record) => statusSchema.parse(record))
  })
}

export async function createStatus(name: string, slug: string): Promise<WithoutSource<Status>> {
  const status: WithoutSource<Status> = { slug, name }
  await withStore(STATUSES_STORE, 'readwrite', (store) => {
    store.add(status)
  })
  return status
}

async function reassignTasksAndViews(transaction: IDBTransaction, oldSlug: string, newSlug: string): Promise<void> {
  const taskStore = transaction.objectStore(TASKS_STORE)
  await iterateCursor(taskStore, (cursor) => {
    const record = cursor.value as StoredTask
    if (record.statusSlug === oldSlug) {
      cursor.update({ ...record, statusSlug: newSlug })
    }
  })

  const viewStore = transaction.objectStore(VIEWS_STORE)
  const views = (await requestToPromise(viewStore.getAll())) as UserDefinedView[]
  for (const view of views) {
    if (view.statusSlugs.includes(oldSlug)) {
      viewStore.put({ ...view, statusSlugs: view.statusSlugs.map((s) => (s === oldSlug ? newSlug : s)) })
    }
  }
}

export async function updateStatus(oldSlug: string, newSlug: string, newName: string): Promise<void> {
  await withTransaction([STATUSES_STORE, TASKS_STORE, VIEWS_STORE], 'readwrite', async (transaction) => {
    const statusStore = transaction.objectStore(STATUSES_STORE)

    if (oldSlug !== newSlug) {
      statusStore.delete(oldSlug)
      await reassignTasksAndViews(transaction, oldSlug, newSlug)
    }
    statusStore.put({ slug: newSlug, name: newName })
  })
}

export async function deleteStatus(slug: string): Promise<void> {
  await withStore(STATUSES_STORE, 'readwrite', (store) => {
    store.delete(slug)
  })
}

export type StatusUsage = { taskIds: number[]; viewIds: string[] }

export async function getStatusUsage(slug: string): Promise<StatusUsage> {
  return withTransaction([TASKS_STORE, VIEWS_STORE], 'readonly', async (tx) => {
    const taskStore = tx.objectStore(TASKS_STORE)
    const viewStore = tx.objectStore(VIEWS_STORE)

    const tasksWithIds = await getAllWithIds<StoredTask>(taskStore)
    const views = (await requestToPromise(viewStore.getAll())) as UserDefinedView[]

    const taskIds = tasksWithIds
      .filter((t) => t.statusSlug === slug)
      .map((t) => t.id)
    const viewIds = views.filter((v) => v.statusSlugs.includes(slug)).map((v) => v.id)

    return { taskIds, viewIds }
  })
}

export async function isStatusInUse(slug: string): Promise<boolean> {
  const usage = await getStatusUsage(slug)
  return usage.taskIds.length > 0 || usage.viewIds.length > 0
}

export async function reassignStatus(fromSlug: string, toSlug: string): Promise<void> {
  await withTransaction([TASKS_STORE, VIEWS_STORE], 'readwrite', (transaction) =>
    reassignTasksAndViews(transaction, fromSlug, toSlug),
  )
}
