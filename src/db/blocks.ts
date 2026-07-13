import { z } from 'zod'
import {
  RELATIONSHIPS_STORE,
  getAllWithIds,
  keyToTaskId,
  requestToPromise,
  withStore,
  type StoredBlockingRelationship,
} from './client'
import type { BlockingRelationship } from '../types'

const storedBlockingRelationshipSchema = z.object({
  fromTaskId: z.number(),
  toTaskId: z.number(),
  type: z.literal('blocks'),
}) satisfies z.ZodType<StoredBlockingRelationship>

export async function loadBlocks(taskId: number): Promise<BlockingRelationship[]> {
  return withStore(RELATIONSHIPS_STORE, 'readonly', async (store) => {
    const fromIndex = store.index('fromTaskId')
    const toIndex = store.index('toTaskId')

    const from = await getAllWithIds<Record<string, unknown>>(fromIndex, taskId)
    const to = await getAllWithIds<Record<string, unknown>>(toIndex, taskId)
    return [...from, ...to].map(({ id, ...raw }) => ({ id, ...storedBlockingRelationshipSchema.parse(raw) }))
  })
}

export async function loadAllBlocks(): Promise<BlockingRelationship[]> {
  return withStore(RELATIONSHIPS_STORE, 'readonly', async (store) => {
    const records = await getAllWithIds<Record<string, unknown>>(store)
    return records.map(({ id, ...raw }) => ({ id, ...storedBlockingRelationshipSchema.parse(raw) }))
  })
}

export async function addBlock(fromTaskId: number, toTaskId: number, type: 'blocks'): Promise<BlockingRelationship> {
  const stored: StoredBlockingRelationship = { fromTaskId, toTaskId, type }
  const key = await withStore(RELATIONSHIPS_STORE, 'readwrite', (store) =>
    requestToPromise(store.add(stored)),
  )
  return { id: keyToTaskId(key), fromTaskId, toTaskId, type }
}

export async function deleteBlock(id: number): Promise<void> {
  await withStore(RELATIONSHIPS_STORE, 'readwrite', (store) => {
    store.delete(id)
  })
}

export async function deleteBlocksByTaskInStore(store: IDBObjectStore, taskId: number): Promise<void> {
  const fromKeys = await requestToPromise(store.index('fromTaskId').getAllKeys(taskId))
  const toKeys = await requestToPromise(store.index('toTaskId').getAllKeys(taskId))
  for (const key of [...fromKeys, ...toKeys]) store.delete(key)
}

export async function deleteBlocksByTask(taskId: number): Promise<void> {
  await withStore(RELATIONSHIPS_STORE, 'readwrite', (store) => deleteBlocksByTaskInStore(store, taskId))
}
