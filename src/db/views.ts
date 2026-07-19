import { z } from 'zod'
import { VIEWS_STORE, requestToPromise, withStore } from './client'
import type { UserDefinedView } from '../types'

// The on-disk record (and the VIEWS_STORE keyPath, see db/client.ts) keeps the
// field name `slug` from before issue #248, so existing users' persisted views
// load without a migration. Only the in-memory `UserDefinedView.id` field name
// changed; toView/toStored map across that boundary.
const storedViewSchema = z.object({
  slug: z.string(),
  name: z.string(),
  statusSlugs: z.array(z.string()),
})

export type StoredView = z.infer<typeof storedViewSchema>

function toView(stored: StoredView): UserDefinedView {
  const { slug, ...rest } = stored
  return { id: slug, ...rest }
}

function toStored(view: UserDefinedView): StoredView {
  const { id, ...rest } = view
  return { slug: id, ...rest }
}

export async function loadViews(): Promise<UserDefinedView[]> {
  return withStore(VIEWS_STORE, 'readonly', async (store) => {
    const raw = await requestToPromise(store.getAll())
    return raw.map((record) => toView(storedViewSchema.parse(record)))
  })
}

export async function saveView(view: UserDefinedView): Promise<void> {
  await withStore(VIEWS_STORE, 'readwrite', (store) => {
    store.put(toStored(view))
  })
}

export async function deleteView(id: string): Promise<void> {
  await withStore(VIEWS_STORE, 'readwrite', (store) => {
    store.delete(id)
  })
}
