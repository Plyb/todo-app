import { LexoRank } from 'lexorank'
import { z } from 'zod'
import type { BlockingRelationship, ScheduledTransition, Status, SubtaskLink, Task } from '../types'

export type Stored<T extends { id: number }> = Omit<T, 'id'>

export type StoredTask = Stored<Task>
export type StoredBlockingRelationship = Stored<BlockingRelationship>
export type StoredSubtaskLink = Stored<SubtaskLink>

export type StoredScheduledTransition = Stored<ScheduledTransition>

// A field missing/null in a stored record defaults rather than fails validation:
// a database that already ran the pre-#127 buggy migration (see
// migrateTaskFields) may be stuck on DB_VERSION 8 with done/rank/statusSlug/notes
// still absent, since that migration only backfills once per oldVersion gate.
// Same-store schemas for DB-8b should follow this withDefault + z.object pattern.
export function withDefault<T>(schema: z.ZodType<T>, fallback: () => T): z.ZodType<T> {
  return z.preprocess((value) => (value === undefined || value === null ? fallback() : value), schema)
}

export const DB_NAME = 'todo-app'
export const DB_VERSION = 13
export const TASKS_STORE = 'tasks'
export const STATUSES_STORE = 'statuses'
export const VIEWS_STORE = 'views'
export const SCHEDULED_TRANSITIONS_STORE = 'scheduledTransitions'
export const RELATIONSHIPS_STORE = 'relationships'
export const SUBTASKS_STORE = 'subtasks'
export const SOURCE_CONFIGURATIONS_STORE = 'sourceConfigurations'

// Stable id of the built-in IndexedDB source seeded at migration time. Views
// reference statuses by this id (see #12), so it must not change.
export const DEFAULT_SOURCE_ID = 'indexeddb'

const DEFAULT_STATUSES: Status[] = [
  { slug: 'today', name: 'Today' },
  { slug: 'today-extra', name: 'Today Extra' },
  { slug: 'backlog', name: 'Backlog' },
]

const DEMO_TASKS: StoredTask[] = (() => {
  const middle = LexoRank.middle()
  return [
    { name: 'Buy groceries', completedAt: null, archivedAt: null, rank: middle.toString(), statusSlug: 'today', notes: '' },
    { name: 'Walk the dog', completedAt: null, archivedAt: null, rank: middle.genNext().toString(), statusSlug: 'today', notes: '' },
    {
      name: 'Write weekly update',
      completedAt: null,
      archivedAt: null,
      rank: middle.genNext().genNext().toString(),
      statusSlug: 'backlog',
      notes: '',
    },
  ]
})()

let openDatabasePromise: Promise<IDBDatabase> | undefined

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

export function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })
}

function abortTransaction(transaction: IDBTransaction): void {
  try {
    transaction.abort()
  } catch {
    // The transaction may already be aborting/finished (e.g. an IDB request
    // error is aborting it, or it already committed); the original error stands.
  }
}

export type IterateCursorOptions = {
  index?: string
  range?: IDBKeyRange
  direction?: IDBCursorDirection
  shouldBreak?: (cursor: IDBCursorWithValue) => boolean
}

export function iterateCursor(
  store: IDBObjectStore,
  visit: (cursor: IDBCursorWithValue) => void,
  options: IterateCursorOptions = {},
): Promise<void> {
  const { index, range, direction, shouldBreak } = options
  const source: IDBObjectStore | IDBIndex = index ? store.index(index) : store

  return new Promise((resolve, reject) => {
    const cursorRequest = source.openCursor(range, direction)

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) {
        resolve()
        return
      }

      if (shouldBreak?.(cursor)) {
        resolve()
        return
      }

      visit(cursor)
      cursor.continue()
    }

    cursorRequest.onerror = () => reject(cursorRequest.error)
  })
}

export function keyToTaskId(key: IDBValidKey): number {
  if (typeof key === 'number' && Number.isFinite(key)) {
    return key
  }

  throw new Error('IndexedDB task key is not a numeric id')
}

type GetAllSource<T> = {
  getAll(query?: IDBValidKey | IDBKeyRange | null): IDBRequest<T[]>
  getAllKeys(query?: IDBValidKey | IDBKeyRange | null): IDBRequest<IDBValidKey[]>
}

export async function getAllWithIds<T>(
  source: GetAllSource<T>,
  query?: IDBValidKey | IDBKeyRange | null,
): Promise<(T & { id: number })[]> {
  const records = await requestToPromise(source.getAll(query))
  const keys = await requestToPromise(source.getAllKeys(query))
  return records.map((record, index) => ({ ...record, id: keyToTaskId(keys[index]) }))
}

function seedDefaultStatuses(transaction: IDBTransaction): void {
  const statusStore = transaction.objectStore(STATUSES_STORE)
  for (const status of DEFAULT_STATUSES) {
    statusStore.put(status)
  }
}

// Single cursor pass over TASKS_STORE that backfills every field a returning
// user might be missing, gated on the version they last opened. Backfilling all
// fields in one read-modify-update per record avoids the multi-version race
// (issue #127): separate per-field passes each read the ORIGINAL record before
// the others' cursor.update() committed, so each write spread a stale snapshot
// and clobbered the previously-backfilled field. The `done` -> `completedAt`
// conversion (issue #167) and the `archivedAt` backfill (issue #90) are folded
// into this same pass for the same reason: they must run for every oldVersion
// below 10, which overlaps every other field's gate, so a separate cursor pass
// would reintroduce the race.
async function migrateTaskFields(transaction: IDBTransaction, oldVersion: number): Promise<void> {
  const store = transaction.objectStore(TASKS_STORE)
  let rankGen = LexoRank.middle()
  const todayDateString = new Date().toISOString().slice(0, 10)

  await iterateCursor(store, (cursor) => {
    const record = cursor.value as Partial<StoredTask> & { done?: boolean }
    const updated: Partial<StoredTask> & { done?: boolean } = { ...record }
    let changed = false

    if (oldVersion < 3 && !record.rank) {
      updated.rank = rankGen.toString()
      rankGen = rankGen.genNext()
      changed = true
    }
    if (oldVersion < 4 && !record.statusSlug) {
      updated.statusSlug = 'backlog'
      changed = true
    }
    if (oldVersion < 5 && record.notes === undefined) {
      updated.notes = ''
      changed = true
    }
    if (record.completedAt === undefined) {
      // `true` becomes today's date rather than some earlier date, so records
      // completed under the old schema still get one full day of grace before
      // auto-archiving, matching completedAt semantics for a task completed
      // today under the new schema.
      updated.completedAt = record.done ? todayDateString : null
      delete updated.done
      changed = true
    }
    if (record.archivedAt === undefined) {
      updated.archivedAt = null
      changed = true
    }

    if (changed) {
      cursor.update(updated)
    }
  })
}

async function migrateAddViews(transaction: IDBTransaction): Promise<void> {
  // Seed one default view per existing status, so users start with views but
  // can freely delete them afterward without them being regenerated.
  const statusStore = transaction.objectStore(STATUSES_STORE)
  const statuses = (await requestToPromise(statusStore.getAll())) as Status[]
  const viewStore = transaction.objectStore(VIEWS_STORE)
  for (const status of statuses) {
    viewStore.put({ slug: status.slug, name: status.name, statusSlugs: [status.slug] })
  }
}

function migrateAddTaskIndices(transaction: IDBTransaction): void {
  const store = transaction.objectStore(TASKS_STORE)

  // Ascending by rank within a statusSlug, matching byRank.
  if (!store.indexNames.contains('by_status_rank')) {
    store.createIndex('by_status_rank', ['statusSlug', 'rank'], { unique: false })
  }

  // archivedAt is null for active tasks - an invalid IndexedDB key - so this
  // index naturally excludes them. Read descending (most-recent-first).
  if (!store.indexNames.contains('by_archivedAt')) {
    store.createIndex('by_archivedAt', 'archivedAt', { unique: false })
  }
}

async function migrateViewsToIdKeyPath(db: IDBDatabase, transaction: IDBTransaction): Promise<void> {
  const oldStore = transaction.objectStore(VIEWS_STORE)
  const legacyViews = (await requestToPromise(oldStore.getAll())) as { slug: string; name: string; statusSlugs: string[] }[]

  db.deleteObjectStore(VIEWS_STORE)
  const newStore = db.createObjectStore(VIEWS_STORE, { keyPath: 'id' })
  for (const { slug, ...rest } of legacyViews) {
    newStore.put({ id: slug, ...rest })
  }
}

type MigrationStep = {
  version: number
  migrate: (db: IDBDatabase, transaction: IDBTransaction, oldVersion: number) => void | Promise<void>
}

const MIGRATION_STEPS: MigrationStep[] = [
  {
    version: 1,
    migrate: (db) => {
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        db.createObjectStore(TASKS_STORE, { autoIncrement: true })
      }
    },
  },
  {
    version: 4,
    migrate: (db, transaction) => {
      if (!db.objectStoreNames.contains(STATUSES_STORE)) {
        db.createObjectStore(STATUSES_STORE, { keyPath: 'slug' })
      }
      seedDefaultStatuses(transaction)
    },
  },
  {
    version: 6,
    migrate: (db, transaction) => {
      if (!db.objectStoreNames.contains(VIEWS_STORE)) {
        db.createObjectStore(VIEWS_STORE, { keyPath: 'slug' })
      }
      if (!db.objectStoreNames.contains(RELATIONSHIPS_STORE)) {
        const relStore = db.createObjectStore(RELATIONSHIPS_STORE, { autoIncrement: true })
        relStore.createIndex('fromTaskId', 'fromTaskId', { unique: false })
        relStore.createIndex('toTaskId', 'toTaskId', { unique: false })
      }
      return migrateAddViews(transaction)
    },
  },
  {
    version: 7,
    migrate: (db) => {
      if (!db.objectStoreNames.contains(SCHEDULED_TRANSITIONS_STORE)) {
        db.createObjectStore(SCHEDULED_TRANSITIONS_STORE, { autoIncrement: true })
      }
    },
  },
  {
    version: 8,
    migrate: (db) => {
      if (db.objectStoreNames.contains(SUBTASKS_STORE)) {
        db.deleteObjectStore(SUBTASKS_STORE)
      }
      const subtaskLinksStore = db.createObjectStore(SUBTASKS_STORE, { keyPath: 'id', autoIncrement: true })
      subtaskLinksStore.createIndex('by_parent', 'parentTaskId', { unique: false })
      subtaskLinksStore.createIndex('by_child', 'childTaskId', { unique: true })
    },
  },
  {
    // Backfill rank (v3), statusSlug (v4) and notes (v5), convert done ->
    // completedAt (v9, issue #167), and backfill archivedAt (v10, issue #90),
    // in one cursor pass. Gated at version 10 so it runs whenever any of those
    // fields could be missing or done still needs converting; the per-field
    // oldVersion + presence guards inside pick exactly the ones this user
    // still lacks.
    version: 10,
    migrate: (_db, transaction, oldVersion) => migrateTaskFields(transaction, oldVersion),
  },
  {
    version: 11,
    migrate: (db, transaction) => migrateViewsToIdKeyPath(db, transaction),
  },
  {
    version: 12,
    migrate: (_db, transaction) => migrateAddTaskIndices(transaction),
  },
  {
    // Per-source types (tasks, statuses, etc.) now live behind a TaskSource
    // built from a stored configuration (#12). Seed the single built-in
    // IndexedDB source so every existing install has one source to attribute
    // its data to.
    version: 13,
    migrate: (db) => {
      if (!db.objectStoreNames.contains(SOURCE_CONFIGURATIONS_STORE)) {
        const store = db.createObjectStore(SOURCE_CONFIGURATIONS_STORE, { keyPath: 'id' })
        store.put({ kind: 'indexeddb', id: DEFAULT_SOURCE_ID })
      }
    },
  },
]

export async function openTasksDatabase(): Promise<IDBDatabase> {
  if (openDatabasePromise) {
    return openDatabasePromise
  }

  openDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = request.result
      const transaction = request.transaction!

      // A failed data-backfill must fail loudly: abort the versionchange
      // transaction so the open request errors rather than silently landing a
      // partially-migrated database. Guarded because the underlying IDB request
      // error may already be aborting the transaction.
      const abortOnMigrationError = () => {
        try {
          transaction.abort()
        } catch {
          // Transaction already aborting/finished; the original error stands.
        }
      }

      // Run applicable steps in version order (schema first, then backfill
      // within each step), awaiting each step fully before starting the next
      // so a later step can rely on an earlier step's writes having landed
      // (e.g. v11's migrateViewsToIdKeyPath reads VIEWS_STORE after v6's
      // migrateAddViews has finished seeding it, on a brand-new install where
      // both fire in the same upgrade). This is safe because every step's
      // internal awaits are themselves on IDB request promises
      // (requestToPromise/iterateCursor), which keep the versionchange
      // transaction alive; a non-IDB await (e.g. a timer) would be the thing
      // that risks letting it auto-commit.
      async function runMigrationSteps(): Promise<void> {
        for (const step of MIGRATION_STEPS) {
          if (event.oldVersion < step.version) {
            await step.migrate(db, transaction, event.oldVersion)
          }
        }
      }
      runMigrationSteps().catch(abortOnMigrationError)
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      openDatabasePromise = undefined
      reject(request.error ?? new Error('Failed to open IndexedDB'))
    }
  })

  return openDatabasePromise
}

export async function seedDemoTasks(db: IDBDatabase): Promise<void> {
  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  for (const task of DEMO_TASKS) {
    store.put(task)
  }
  await transactionToPromise(transaction)
}

type StoreName =
  | typeof TASKS_STORE
  | typeof STATUSES_STORE
  | typeof VIEWS_STORE
  | typeof SCHEDULED_TRANSITIONS_STORE
  | typeof RELATIONSHIPS_STORE
  | typeof SUBTASKS_STORE
  | typeof SOURCE_CONFIGURATIONS_STORE

export async function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, tx: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(name, mode)
  const store = transaction.objectStore(name)
  try {
    const result = await fn(store, transaction)
    await transactionToPromise(transaction)
    return result
  } catch (error) {
    abortTransaction(transaction)
    throw error
  }
}

export async function withTransaction<T>(
  names: StoreName[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(names, mode)
  try {
    const result = await fn(transaction)
    await transactionToPromise(transaction)
    return result
  } catch (error) {
    abortTransaction(transaction)
    throw error
  }
}

export async function patchRecordById<T>(store: IDBObjectStore, id: number, patch: Partial<T>): Promise<void> {
  const existing = (await requestToPromise(store.get(id))) as T | undefined
  if (existing) {
    store.put({ ...existing, ...patch }, id)
  }
}
