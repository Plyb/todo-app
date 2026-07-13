import { LexoRank } from 'lexorank'
import { byRank, byStringKey } from './rank-utils'

export type Status = {
  slug: string
  name: string
}

export type Task = {
  id: number
  name: string
  done: boolean
  rank: string
  statusSlug: string
  notes: string
}

export type SubtaskLink = { id: number; parentTaskId: number; childTaskId: number; rank: string }

export type BlockingRelationship = { id: number; fromTaskId: number; toTaskId: number; type: 'blocks' }

type StoredTask = Omit<Task, 'id'>
type StoredBlockingRelationship = Omit<BlockingRelationship, 'id'>
type StoredSubtaskLink = Omit<SubtaskLink, 'id'>

export type View = {
  slug: string
  name: string
  statusSlugs: string[]
}

export type ScheduledTransition = {
  id: number
  taskId: number
  date: string  // ISO date string 'YYYY-MM-DD'
  statusSlug: string
}

type StoredScheduledTransition = Omit<ScheduledTransition, 'id'>

const DB_NAME = 'todo-app'
const DB_VERSION = 8
const TASKS_STORE = 'tasks'
const STATUSES_STORE = 'statuses'
const VIEWS_STORE = 'views'
const SCHEDULED_TRANSITIONS_STORE = 'scheduledTransitions'
const RELATIONSHIPS_STORE = 'relationships'
const SUBTASKS_STORE = 'subtasks'

const DEFAULT_STATUSES: Status[] = [
  { slug: 'today', name: 'Today' },
  { slug: 'today-extra', name: 'Today Extra' },
  { slug: 'backlog', name: 'Backlog' },
  { slug: 'archived', name: 'Archived' },
]

const DEMO_TASKS: StoredTask[] = (() => {
  const middle = LexoRank.middle()
  return [
    { name: 'Buy groceries', done: false, rank: middle.toString(), statusSlug: 'today', notes: '' },
    { name: 'Walk the dog', done: false, rank: middle.genNext().toString(), statusSlug: 'today', notes: '' },
    { name: 'Write weekly update', done: false, rank: middle.genNext().genNext().toString(), statusSlug: 'backlog', notes: '' },
  ]
})()

let openDatabasePromise: Promise<IDBDatabase> | undefined

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })
}

function iterateCursor(store: IDBObjectStore, visit: (cursor: IDBCursorWithValue) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const cursorRequest = store.openCursor()

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) {
        resolve()
        return
      }

      visit(cursor)
      cursor.continue()
    }

    cursorRequest.onerror = () => reject(cursorRequest.error)
  })
}

function keyToTaskId(key: IDBValidKey): number {
  if (typeof key === 'number' && Number.isFinite(key)) {
    return key
  }

  throw new Error('IndexedDB task key is not a numeric id')
}

type GetAllSource<T> = {
  getAll(query?: IDBValidKey | IDBKeyRange | null): IDBRequest<T[]>
  getAllKeys(query?: IDBValidKey | IDBKeyRange | null): IDBRequest<IDBValidKey[]>
}

async function getAllWithIds<T>(
  source: GetAllSource<T>,
  query?: IDBValidKey | IDBKeyRange | null,
): Promise<(T & { id: number })[]> {
  const records = await requestToPromise(source.getAll(query))
  const keys = await requestToPromise(source.getAllKeys(query))
  return records.map((record, index) => ({ ...record, id: keyToTaskId(keys[index]) }))
}

async function migrateAddDone(transaction: IDBTransaction): Promise<void> {
  const store = transaction.objectStore(TASKS_STORE)
  await iterateCursor(store, (cursor) => {
    const record = cursor.value as StoredTask
    if (record.done === undefined) {
      cursor.update({ ...record, done: false })
    }
  })
}

async function migrateAddRanks(transaction: IDBTransaction): Promise<void> {
  const store = transaction.objectStore(TASKS_STORE)
  let rankGen = LexoRank.middle()

  await iterateCursor(store, (cursor) => {
    const record = cursor.value as { name: string; rank?: string }
    if (!record.rank) {
      cursor.update({ ...record, rank: rankGen.toString() })
      rankGen = rankGen.genNext()
    }
  })
}

async function migrateAddStatuses(transaction: IDBTransaction): Promise<void> {
  // Seed default statuses into the newly created store
  const statusStore = transaction.objectStore(STATUSES_STORE)
  for (const status of DEFAULT_STATUSES) {
    statusStore.put(status)
  }

  // Migrate existing tasks to have statusSlug: 'backlog'
  const taskStore = transaction.objectStore(TASKS_STORE)
  await iterateCursor(taskStore, (cursor) => {
    const record = cursor.value as StoredTask & { statusSlug?: string }
    if (!record.statusSlug) {
      cursor.update({ ...record, statusSlug: 'backlog' })
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

async function migrateAddNotes(transaction: IDBTransaction): Promise<void> {
  const store = transaction.objectStore(TASKS_STORE)
  await iterateCursor(store, (cursor) => {
    const record = cursor.value as { notes?: string }
    if (record.notes === undefined) {
      cursor.update({ ...record, notes: '' })
    }
  })
}

type MigrationStep = {
  version: number
  migrate: (db: IDBDatabase, transaction: IDBTransaction) => void | Promise<void>
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
    version: 2,
    migrate: (_db, transaction) => migrateAddDone(transaction),
  },
  {
    version: 3,
    migrate: (_db, transaction) => migrateAddRanks(transaction),
  },
  {
    version: 4,
    migrate: (db, transaction) => {
      if (!db.objectStoreNames.contains(STATUSES_STORE)) {
        db.createObjectStore(STATUSES_STORE, { keyPath: 'slug' })
      }
      return migrateAddStatuses(transaction)
    },
  },
  {
    version: 5,
    migrate: (_db, transaction) => migrateAddNotes(transaction),
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
]

async function openTasksDatabase(): Promise<IDBDatabase> {
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

      // Fire the applicable steps synchronously in version order (schema first,
      // then backfill within each step). We deliberately do NOT `await` between
      // steps: a non-IDB await could let the versionchange transaction
      // auto-commit. The pending IDB requests keep the transaction alive, and
      // synchronous firing preserves cross-step ordering (e.g. status seeds are
      // queued before migrateAddViews reads them).
      const pending: Promise<void>[] = []
      for (const step of MIGRATION_STEPS) {
        if (event.oldVersion < step.version) {
          const result = step.migrate(db, transaction)
          if (result) {
            pending.push(result)
          }
        }
      }
      Promise.all(pending).catch(abortOnMigrationError)
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      openDatabasePromise = undefined
      reject(request.error ?? new Error('Failed to open IndexedDB'))
    }
  })

  return openDatabasePromise
}

async function seedDemoTasks(db: IDBDatabase): Promise<void> {
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

async function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, tx: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(name, mode)
  const store = transaction.objectStore(name)
  const result = await fn(store, transaction)
  await transactionToPromise(transaction)
  return result
}

async function withTransaction<T>(
  names: StoreName[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(names, mode)
  const result = await fn(transaction)
  await transactionToPromise(transaction)
  return result
}

export async function loadTasks(): Promise<Task[]> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(TASKS_STORE, 'readonly')
  const store = transaction.objectStore(TASKS_STORE)
  const storedTasks = (await requestToPromise(store.getAll())) as StoredTask[]
  const taskKeys = await requestToPromise(store.getAllKeys())
  await transactionToPromise(transaction)

  if (storedTasks.length > 0) {
    const tasks = storedTasks.map((task, index) => ({
      id: keyToTaskId(taskKeys[index]),
      name: task.name,
      done: task.done ?? false,
      rank: task.rank ?? LexoRank.middle().toString(),
      statusSlug: task.statusSlug ?? 'backlog',
      notes: task.notes ?? '',
    }))
    tasks.sort(byRank)
    return tasks
  }

  await seedDemoTasks(db)
  return loadTasks()
}

export async function loadStatuses(): Promise<Status[]> {
  return withStore(STATUSES_STORE, 'readonly', async (store) =>
    (await requestToPromise(store.getAll())) as Status[],
  )
}

export async function createStatus(name: string, slug: string): Promise<Status> {
  const status: Status = { slug, name }
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
  const views = (await requestToPromise(viewStore.getAll())) as View[]
  for (const view of views) {
    if (view.statusSlugs.includes(oldSlug)) {
      viewStore.put({ ...view, statusSlugs: view.statusSlugs.map((s) => (s === oldSlug ? newSlug : s)) })
    }
  }
}

export async function updateStatus(oldSlug: string, newSlug: string, newName: string): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction([STATUSES_STORE, TASKS_STORE, VIEWS_STORE], 'readwrite')
  const statusStore = transaction.objectStore(STATUSES_STORE)

  if (oldSlug !== newSlug) {
    statusStore.delete(oldSlug)
    await reassignTasksAndViews(transaction, oldSlug, newSlug)
  }
  statusStore.put({ slug: newSlug, name: newName })

  await transactionToPromise(transaction)
}

export async function deleteStatus(slug: string): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(STATUSES_STORE, 'readwrite')
  const store = transaction.objectStore(STATUSES_STORE)
  store.delete(slug)
  await transactionToPromise(transaction)
}

export type StatusUsage = { taskIds: number[]; viewSlugs: string[] }

export async function getStatusUsage(slug: string): Promise<StatusUsage> {
  return withTransaction([TASKS_STORE, VIEWS_STORE], 'readonly', async (tx) => {
    const taskStore = tx.objectStore(TASKS_STORE)
    const viewStore = tx.objectStore(VIEWS_STORE)

    const tasksWithIds = await getAllWithIds<StoredTask>(taskStore)
    const views = (await requestToPromise(viewStore.getAll())) as View[]

    const taskIds = tasksWithIds
      .filter((t) => t.statusSlug === slug)
      .map((t) => t.id)
    const viewSlugs = views.filter((v) => v.statusSlugs.includes(slug)).map((v) => v.slug)

    return { taskIds, viewSlugs }
  })
}

export async function isStatusInUse(slug: string): Promise<boolean> {
  const usage = await getStatusUsage(slug)
  return usage.taskIds.length > 0 || usage.viewSlugs.length > 0
}

export async function reassignStatus(fromSlug: string, toSlug: string): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction([TASKS_STORE, VIEWS_STORE], 'readwrite')
  await reassignTasksAndViews(transaction, fromSlug, toSlug)
  await transactionToPromise(transaction)
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
  await withStore(TASKS_STORE, 'readwrite', async (store) => {
    const record = await requestToPromise(store.get(id)) as StoredTask
    store.put({ ...record, done }, id)
  })
}

export async function updateTaskRank(id: number, rank: string): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', async (store) => {
    const existing = (await requestToPromise(store.get(id))) as StoredTask | undefined
    if (existing) {
      store.put({ ...existing, rank }, id)
    }
  })
}

export async function updateTaskName(id: number, name: string): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', async (store) => {
    const existing = (await requestToPromise(store.get(id))) as StoredTask | undefined
    if (existing) {
      store.put({ ...existing, name }, id)
    }
  })
}

export async function updateTaskNotes(id: number, notes: string): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', async (store) => {
    const existing = (await requestToPromise(store.get(id))) as StoredTask | undefined
    if (existing) {
      store.put({ ...existing, notes }, id)
    }
  })
}

export async function updateTaskStatus(id: number, statusSlug: string): Promise<void> {
  await withStore(TASKS_STORE, 'readwrite', async (store) => {
    const existing = (await requestToPromise(store.get(id))) as StoredTask | undefined
    if (existing) {
      store.put({ ...existing, statusSlug }, id)
    }
  })
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

export async function loadSubtaskLinks(parentTaskId: number): Promise<SubtaskLink[]> {
  return withStore(SUBTASKS_STORE, 'readonly', async (store) => {
    const index = store.index('by_parent')
    const links = (await requestToPromise(index.getAll(parentTaskId))) as SubtaskLink[]

    links.sort(byRank)
    return links
  })
}

export async function loadParentLink(childTaskId: number): Promise<SubtaskLink | undefined> {
  return withStore(SUBTASKS_STORE, 'readonly', async (store) => {
    const index = store.index('by_child')
    return (await requestToPromise(index.get(childTaskId))) as SubtaskLink | undefined
  })
}

export async function loadAllSubtaskLinks(): Promise<SubtaskLink[]> {
  return withStore(SUBTASKS_STORE, 'readonly', async (store) =>
    (await requestToPromise(store.getAll())) as SubtaskLink[],
  )
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

async function deleteSubtaskLinksByParentInStore(store: IDBObjectStore, parentTaskId: number): Promise<void> {
  const index = store.index('by_parent')
  const keys = await requestToPromise(index.getAllKeys(parentTaskId))
  for (const key of keys) store.delete(key)
}

async function deleteSubtaskLinksByChildInStore(store: IDBObjectStore, childTaskId: number): Promise<void> {
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

export async function loadViews(): Promise<View[]> {
  return withStore(VIEWS_STORE, 'readonly', async (store) =>
    (await requestToPromise(store.getAll())) as View[],
  )
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

export async function loadScheduledTransitions(taskId: number): Promise<ScheduledTransition[]> {
  return withStore(SCHEDULED_TRANSITIONS_STORE, 'readonly', async (store) => {
    const transitions = await getAllWithIds<StoredScheduledTransition>(store)

    return transitions
      .filter((t) => t.taskId === taskId)
      .sort(byStringKey('date'))
  })
}

export async function addScheduledTransition(taskId: number, date: string, statusSlug: string): Promise<ScheduledTransition> {
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

export async function loadAllDueTransitions(): Promise<ScheduledTransition[]> {
  return withStore(SCHEDULED_TRANSITIONS_STORE, 'readonly', async (store) => {
    const transitions = await getAllWithIds<StoredScheduledTransition>(store)

    const today = new Date().toISOString().slice(0, 10)
    return transitions.filter((t) => t.date <= today)
  })
}

export async function loadBlocks(taskId: number): Promise<BlockingRelationship[]> {
  return withStore(RELATIONSHIPS_STORE, 'readonly', async (store) => {
    const fromIndex = store.index('fromTaskId')
    const toIndex = store.index('toTaskId')

    const from = await getAllWithIds<StoredBlockingRelationship>(fromIndex, taskId)
    const to = await getAllWithIds<StoredBlockingRelationship>(toIndex, taskId)
    return [...from, ...to]
  })
}

export async function loadAllBlocks(): Promise<BlockingRelationship[]> {
  return withStore(RELATIONSHIPS_STORE, 'readonly', async (store) =>
    getAllWithIds<StoredBlockingRelationship>(store),
  )
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

async function deleteBlocksByTaskInStore(store: IDBObjectStore, taskId: number): Promise<void> {
  const fromKeys = await requestToPromise(store.index('fromTaskId').getAllKeys(taskId))
  const toKeys = await requestToPromise(store.index('toTaskId').getAllKeys(taskId))
  for (const key of [...fromKeys, ...toKeys]) store.delete(key)
}

export async function deleteBlocksByTask(taskId: number): Promise<void> {
  await withStore(RELATIONSHIPS_STORE, 'readwrite', (store) => deleteBlocksByTaskInStore(store, taskId))
}
