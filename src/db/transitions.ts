import { z } from 'zod'
import { byStringKey } from '../rank-utils'
import {
  SCHEDULED_TRANSITIONS_STORE,
  getAllWithIds,
  keyToTaskId,
  requestToPromise,
  withStore,
  type StoredScheduledTransition,
  type WithoutSource,
} from './client'
import type { ScheduledTransition } from '../types'

type StoredTransitionWithId = WithoutSource<ScheduledTransition>

const storedScheduledTransitionSchema = z.object({
  taskId: z.number(),
  date: z.string(),
  statusSlug: z.string(),
}) satisfies z.ZodType<StoredScheduledTransition>

export async function loadScheduledTransitions(taskId: number): Promise<StoredTransitionWithId[]> {
  return withStore(SCHEDULED_TRANSITIONS_STORE, 'readonly', async (store) => {
    const records = await getAllWithIds<Record<string, unknown>>(store)
    const transitions = records.map(({ id, ...raw }) => ({ id, ...storedScheduledTransitionSchema.parse(raw) }))

    return transitions
      .filter((t) => t.taskId === taskId)
      .sort(byStringKey('date'))
  })
}

export async function addScheduledTransition(taskId: number, date: string, statusSlug: string): Promise<StoredTransitionWithId> {
  const stored: StoredScheduledTransition = { taskId, date, statusSlug }
  const key = await withStore(SCHEDULED_TRANSITIONS_STORE, 'readwrite', (store) =>
    requestToPromise(store.add(stored)),
  )
  return { id: keyToTaskId(key), taskId, date, statusSlug }
}

export async function deleteScheduledTransition(id: number): Promise<void> {
  await withStore(SCHEDULED_TRANSITIONS_STORE, 'readwrite', (store) => {
    store.delete(id)
  })
}

export async function loadAllDueTransitions(): Promise<StoredTransitionWithId[]> {
  return withStore(SCHEDULED_TRANSITIONS_STORE, 'readonly', async (store) => {
    const records = await getAllWithIds<Record<string, unknown>>(store)
    const transitions = records.map(({ id, ...raw }) => ({ id, ...storedScheduledTransitionSchema.parse(raw) }))

    const today = new Date().toISOString().slice(0, 10)
    return transitions.filter((t) => t.date <= today)
  })
}
