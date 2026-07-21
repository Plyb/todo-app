import { z } from 'zod'
import { VIEWS_STORE, requestToPromise, withStore, withTransaction } from './client'
import type { UserDefinedView } from '../types'

const viewSchema = z.object({
  id: z.string(),
  name: z.string(),
  statusRefs: z.array(z.object({ slug: z.string(), sourceId: z.string() })),
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

export async function reassignStatusSlugsInViews(
  sourceId: string,
  oldSlug: string,
  newSlug: string,
  { transaction } : { transaction?: IDBTransaction } = {}
) {
  return withDefaultedTransaction(transaction, async (transaction: IDBTransaction) => {
    const viewStore = transaction.objectStore(VIEWS_STORE)
    const views = (await requestToPromise(viewStore.getAll())) as UserDefinedView[]
    for (const view of views) {
      if (view.statusRefs.some((ref) => ref.sourceId === sourceId && ref.slug === oldSlug)) {
        viewStore.put({
          ...view,
          statusRefs: view.statusRefs.map((ref) =>
            ref.sourceId === sourceId && ref.slug === oldSlug ? { ...ref, slug: newSlug } : ref
          ),
        })
      }
    }
  })
}

export async function getStatusUsageInViews(
  sourceId: string,
  slug: string,
  { transaction }: { transaction?: IDBTransaction } = {}
): Promise<string[]> {
  return withDefaultedTransaction(transaction, async (transaction) => {
    const viewStore = transaction.objectStore(VIEWS_STORE)
    const views = (await requestToPromise(viewStore.getAll())) as UserDefinedView[]
    const viewIds = views
        .filter((v) => v.statusRefs.some((ref) => ref.sourceId === sourceId && ref.slug === slug))
        .map((v) => v.id)
    return viewIds
  })
}

async function withDefaultedTransaction<T>(
  maybeTransaction: IDBTransaction | undefined,
  callback: (transaction: IDBTransaction) => Promise<T>
): Promise<T> {
  if (maybeTransaction !== undefined) {
    return callback(maybeTransaction)
  } else {
    return withTransaction([VIEWS_STORE], 'readwrite', callback)
  }
}
