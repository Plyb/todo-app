import { z } from 'zod'
import { VIEWS_STORE, requestToPromise, withStore } from './client'
import type { View } from '../types'

const viewSchema = z.object({
  slug: z.string(),
  name: z.string(),
  statusSlugs: z.array(z.string()),
}) satisfies z.ZodType<View>

export async function loadViews(): Promise<View[]> {
  return withStore(VIEWS_STORE, 'readonly', async (store) => {
    const raw = await requestToPromise(store.getAll())
    return raw.map((record) => viewSchema.parse(record))
  })
}

export async function saveView(view: View): Promise<void> {
  await withStore(VIEWS_STORE, 'readwrite', (store) => {
    store.put(view)
  })
}

export async function deleteView(slug: string): Promise<void> {
  await withStore(VIEWS_STORE, 'readwrite', (store) => {
    store.delete(slug)
  })
}
