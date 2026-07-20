import { z } from 'zod'
import { VIEWS_STORE, requestToPromise, withStore } from './client'
import type { UserDefinedView } from '../types'

const viewSchema = z.object({
  id: z.string(),
  name: z.string(),
  statusSlugs: z.array(z.string()),
}) satisfies z.ZodType<UserDefinedView>

export async function loadViews(): Promise<UserDefinedView[]> {
  return withStore(VIEWS_STORE, 'readonly', async (store) => {
    const raw = await requestToPromise(store.getAll())
    return raw.map((record) => viewSchema.parse(record))
  })
}

export async function saveView(view: UserDefinedView): Promise<void> {
  await withStore(VIEWS_STORE, 'readwrite', (store) => {
    store.put(view)
  })
}

export async function deleteView(id: string): Promise<void> {
  await withStore(VIEWS_STORE, 'readwrite', (store) => {
    store.delete(id)
  })
}
