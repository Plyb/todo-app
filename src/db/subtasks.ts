import { z } from 'zod'
import { byRank } from '../rank-utils'
import {
  SUBTASKS_STORE,
  keyToTaskId,
  requestToPromise,
  withStore,
  type StoredSubtaskLink,
  type SubtaskLink,
} from './client'

const subtaskLinkSchema = z.object({
  id: z.number(),
  parentTaskId: z.number(),
  childTaskId: z.number(),
  rank: z.string(),
}) satisfies z.ZodType<SubtaskLink>

export async function loadSubtaskLinks(parentTaskId: number): Promise<SubtaskLink[]> {
  return withStore(SUBTASKS_STORE, 'readonly', async (store) => {
    const index = store.index('by_parent')
    const raw = await requestToPromise(index.getAll(parentTaskId))
    const links = raw.map((record) => subtaskLinkSchema.parse(record))

    links.sort(byRank)
    return links
  })
}

export async function loadParentLink(childTaskId: number): Promise<SubtaskLink | undefined> {
  return withStore(SUBTASKS_STORE, 'readonly', async (store) => {
    const index = store.index('by_child')
    const raw = await requestToPromise(index.get(childTaskId))
    return raw === undefined ? undefined : subtaskLinkSchema.parse(raw)
  })
}

export async function loadAllSubtaskLinks(): Promise<SubtaskLink[]> {
  return withStore(SUBTASKS_STORE, 'readonly', async (store) => {
    const raw = await requestToPromise(store.getAll())
    return raw.map((record) => subtaskLinkSchema.parse(record))
  })
}

export async function createSubtaskLink(parentTaskId: number, childTaskId: number, rank: string): Promise<SubtaskLink> {
  const stored: StoredSubtaskLink = { parentTaskId, childTaskId, rank }
  const key = await withStore(SUBTASKS_STORE, 'readwrite', (store) =>
    requestToPromise(store.add(stored)),
  )
  return { id: keyToTaskId(key), parentTaskId, childTaskId, rank }
}

export async function updateSubtaskLinkRank(id: number, rank: string): Promise<void> {
  await withStore(SUBTASKS_STORE, 'readwrite', async (store) => {
    const existing = (await requestToPromise(store.get(id))) as SubtaskLink | undefined
    if (existing) {
      store.put({ ...existing, rank })
    }
  })
}

export async function deleteSubtaskLinksByParentInStore(store: IDBObjectStore, parentTaskId: number): Promise<void> {
  const index = store.index('by_parent')
  const keys = await requestToPromise(index.getAllKeys(parentTaskId))
  for (const key of keys) store.delete(key)
}

export async function deleteSubtaskLinksByChildInStore(store: IDBObjectStore, childTaskId: number): Promise<void> {
  const index = store.index('by_child')
  const keys = await requestToPromise(index.getAllKeys(childTaskId))
  for (const key of keys) store.delete(key)
}

export async function deleteSubtaskLinksByParent(parentTaskId: number): Promise<void> {
  await withStore(SUBTASKS_STORE, 'readwrite', (store) => deleteSubtaskLinksByParentInStore(store, parentTaskId))
}

export async function deleteSubtaskLinksByChild(childTaskId: number): Promise<void> {
  await withStore(SUBTASKS_STORE, 'readwrite', (store) => deleteSubtaskLinksByChildInStore(store, childTaskId))
}
