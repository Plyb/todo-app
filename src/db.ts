import { LexoRank } from 'lexorank'

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

function keyToTaskId(key: IDBValidKey): number {
  if (typeof key === 'number' && Number.isFinite(key)) {
    return key
  }

  throw new Error('IndexedDB task key is not a numeric id')
}

async function migrateAddRanks(_db: IDBDatabase, transaction: IDBTransaction): Promise<void> {
  const store = transaction.objectStore(TASKS_STORE)
  const cursorRequest = store.openCursor()

  await new Promise<void>((resolve, reject) => {
    let rankGen = LexoRank.middle()

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) {
        resolve()
        return
      }

      const record = cursor.value as { name: string; rank?: string }
      if (!record.rank) {
        cursor.update({ ...record, rank: rankGen.toString() })
        rankGen = rankGen.genNext()
      }
      cursor.continue()
    }

    cursorRequest.onerror = () => reject(cursorRequest.error)
  })
}

async function migrateAddStatuses(_db: IDBDatabase, transaction: IDBTransaction): Promise<void> {
  // Seed default statuses into the newly created store
  const statusStore = transaction.objectStore(STATUSES_STORE)
  for (const status of DEFAULT_STATUSES) {
    statusStore.put(status)
  }

  // Migrate existing tasks to have statusSlug: 'backlog'
  const taskStore = transaction.objectStore(TASKS_STORE)
  const cursorRequest = taskStore.openCursor()

  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) {
        resolve()
        return
      }

      const record = cursor.value as StoredTask & { statusSlug?: string }
      if (!record.statusSlug) {
        cursor.update({ ...record, statusSlug: 'backlog' })
      }
      cursor.continue()
    }

    cursorRequest.onerror = () => reject(cursorRequest.error)
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
  const cursorRequest = store.openCursor()

  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) {
        resolve()
        return
      }

      const record = cursor.value as { notes?: string }
      if (record.notes === undefined) {
        cursor.update({ ...record, notes: '' })
      }
      cursor.continue()
    }

    cursorRequest.onerror = () => reject(cursorRequest.error)
  })
}

async function openTasksDatabase(): Promise<IDBDatabase> {
  if (openDatabasePromise) {
    return openDatabasePromise
  }

  openDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = request.result
      const transaction = request.transaction!

      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        db.createObjectStore(TASKS_STORE, { autoIncrement: true })
      } else {
        // v1 -> v2: add done field to existing records
        if (event.oldVersion < 2) {
          const store = transaction.objectStore(TASKS_STORE)
          const cursorRequest = store.openCursor()
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (cursor) {
              const record = cursor.value as StoredTask
              if (record.done === undefined) {
                cursor.update({ ...record, done: false })
              }
              cursor.continue()
            }
          }
        }

        // v2 -> v3: add rank field to existing records
        if (event.oldVersion < 3) {
          migrateAddRanks(db, transaction).catch(() => {
            // Migration errors will surface as transaction abort
          })
        }

        // v3 -> v4: add statuses store and statusSlug to tasks
        if (event.oldVersion < 4) {
          migrateAddStatuses(db, transaction).catch(() => {
            // Migration errors will surface as transaction abort
          })
        }

        // v4 -> v5: add notes field to existing records
        if (event.oldVersion < 5) {
          migrateAddNotes(transaction).catch(() => {
            // Migration errors will surface as transaction abort
          })
        }
      }

      // v3 -> v4: add statuses store
      if (event.oldVersion < 4) {
        if (!db.objectStoreNames.contains(STATUSES_STORE)) {
          db.createObjectStore(STATUSES_STORE, { keyPath: 'slug' })
        }
        migrateAddStatuses(db, transaction).catch(() => {
          // Migration errors will surface as transaction abort
        })
      }

      // v5 -> v6: add views store (seeded with one default view per existing status) and relationships store
      if (event.oldVersion < 6) {
        if (!db.objectStoreNames.contains(VIEWS_STORE)) {
          db.createObjectStore(VIEWS_STORE, { keyPath: 'slug' })
        }
        migrateAddViews(transaction).catch(() => {
          // Migration errors will surface as transaction abort
        })

        if (!db.objectStoreNames.contains(RELATIONSHIPS_STORE)) {
          const relStore = db.createObjectStore(RELATIONSHIPS_STORE, { autoIncrement: true })
          relStore.createIndex('fromTaskId', 'fromTaskId', { unique: false })
          relStore.createIndex('toTaskId', 'toTaskId', { unique: false })
        }
      }

      // v6 -> v7: add scheduledTransitions store
      if (event.oldVersion < 7) {
        if (!db.objectStoreNames.contains(SCHEDULED_TRANSITIONS_STORE)) {
          db.createObjectStore(SCHEDULED_TRANSITIONS_STORE, { autoIncrement: true })
        }
      }

      // v7 -> v8: add subtasks store as a parent/child link table (no user data to preserve)
      if (event.oldVersion < 8) {
        if (db.objectStoreNames.contains(SUBTASKS_STORE)) {
          db.deleteObjectStore(SUBTASKS_STORE)
        }
        const subtaskLinksStore = db.createObjectStore(SUBTASKS_STORE, { keyPath: 'id', autoIncrement: true })
        subtaskLinksStore.createIndex('by_parent', 'parentTaskId', { unique: false })
        subtaskLinksStore.createIndex('by_child', 'childTaskId', { unique: true })
      }
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
    tasks.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
    return tasks
  }

  await seedDemoTasks(db)
  return loadTasks()
}

export async function loadStatuses(): Promise<Status[]> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(STATUSES_STORE, 'readonly')
  const store = transaction.objectStore(STATUSES_STORE)
  const statuses = (await requestToPromise(store.getAll())) as Status[]
  await transactionToPromise(transaction)

  return statuses
}

export async function createStatus(name: string, slug: string): Promise<Status> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(STATUSES_STORE, 'readwrite')
  const store = transaction.objectStore(STATUSES_STORE)
  const status: Status = { slug, name }
  store.add(status)
  await transactionToPromise(transaction)
  return status
}

async function reassignTasksAndViews(transaction: IDBTransaction, oldSlug: string, newSlug: string): Promise<void> {
  const taskStore = transaction.objectStore(TASKS_STORE)
  const cursorRequest = taskStore.openCursor()

  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) {
        resolve()
        return
      }

      const record = cursor.value as StoredTask
      if (record.statusSlug === oldSlug) {
        cursor.update({ ...record, statusSlug: newSlug })
      }
      cursor.continue()
    }

    cursorRequest.onerror = () => reject(cursorRequest.error)
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
  const db = await openTasksDatabase()
  const transaction = db.transaction([TASKS_STORE, VIEWS_STORE], 'readonly')
  const taskStore = transaction.objectStore(TASKS_STORE)
  const viewStore = transaction.objectStore(VIEWS_STORE)

  const storedTasks = (await requestToPromise(taskStore.getAll())) as StoredTask[]
  const taskKeys = await requestToPromise(taskStore.getAllKeys())
  const views = (await requestToPromise(viewStore.getAll())) as View[]
  await transactionToPromise(transaction)

  const taskIds = storedTasks
    .map((task, index) => ({ id: keyToTaskId(taskKeys[index]), statusSlug: task.statusSlug }))
    .filter((t) => t.statusSlug === slug)
    .map((t) => t.id)
  const viewSlugs = views.filter((v) => v.statusSlugs.includes(slug)).map((v) => v.slug)

  return { taskIds, viewSlugs }
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
  const db = await openTasksDatabase()
  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  const request = store.add({ name, done: false, rank, statusSlug, notes: '' })
  const key = await requestToPromise(request)
  await transactionToPromise(transaction)
  return { id: keyToTaskId(key), name, done: false, rank, statusSlug, notes: '' }
}

export async function saveTask(task: Task): Promise<void> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  store.put({ name: task.name, done: task.done, rank: task.rank, statusSlug: task.statusSlug, notes: task.notes }, task.id)
  await transactionToPromise(transaction)
}

export async function updateTaskDone(id: number, done: boolean): Promise<void> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  const record = await requestToPromise(store.get(id)) as StoredTask
  store.put({ ...record, done }, id)
  await transactionToPromise(transaction)
}

export async function updateTaskRank(id: number, rank: string): Promise<void> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  const existing = (await requestToPromise(store.get(id))) as StoredTask | undefined
  if (existing) {
    store.put({ ...existing, rank }, id)
  }
  await transactionToPromise(transaction)
}

export async function updateTaskName(id: number, name: string): Promise<void> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  const existing = (await requestToPromise(store.get(id))) as StoredTask | undefined
  if (existing) {
    store.put({ ...existing, name }, id)
  }
  await transactionToPromise(transaction)
}

export async function updateTaskNotes(id: number, notes: string): Promise<void> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  const existing = (await requestToPromise(store.get(id))) as StoredTask | undefined
  if (existing) {
    store.put({ ...existing, notes }, id)
  }
  await transactionToPromise(transaction)
}

export async function updateTaskStatus(id: number, statusSlug: string): Promise<void> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  const existing = (await requestToPromise(store.get(id))) as StoredTask | undefined
  if (existing) {
    store.put({ ...existing, statusSlug }, id)
  }
  await transactionToPromise(transaction)
}

export async function deleteTask(id: number): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  store.delete(id)
  await transactionToPromise(transaction)
  // The deleted task may have been a parent (its links to children are removed,
  // children survive as independent tasks) and/or a child (its own link is removed).
  await deleteSubtaskLinksByParent(id)
  await deleteSubtaskLinksByChild(id)
  await deleteBlocksByTask(id)
}

export async function loadSubtaskLinks(parentTaskId: number): Promise<SubtaskLink[]> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(SUBTASKS_STORE, 'readonly')
  const store = transaction.objectStore(SUBTASKS_STORE)
  const index = store.index('by_parent')
  const links = (await requestToPromise(index.getAll(parentTaskId))) as SubtaskLink[]
  await transactionToPromise(transaction)

  links.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
  return links
}

export async function loadParentLink(childTaskId: number): Promise<SubtaskLink | undefined> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(SUBTASKS_STORE, 'readonly')
  const store = transaction.objectStore(SUBTASKS_STORE)
  const index = store.index('by_child')
  const link = (await requestToPromise(index.get(childTaskId))) as SubtaskLink | undefined
  await transactionToPromise(transaction)
  return link
}

export async function loadAllSubtaskLinks(): Promise<SubtaskLink[]> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(SUBTASKS_STORE, 'readonly')
  const store = transaction.objectStore(SUBTASKS_STORE)
  const links = (await requestToPromise(store.getAll())) as SubtaskLink[]
  await transactionToPromise(transaction)
  return links
}

export async function createSubtaskLink(parentTaskId: number, childTaskId: number, rank: string): Promise<SubtaskLink> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(SUBTASKS_STORE, 'readwrite')
  const store = transaction.objectStore(SUBTASKS_STORE)
  const stored: StoredSubtaskLink = { parentTaskId, childTaskId, rank }
  const key = await requestToPromise(store.add(stored))
  await transactionToPromise(transaction)
  return { id: keyToTaskId(key), parentTaskId, childTaskId, rank }
}

export async function updateSubtaskLinkRank(id: number, rank: string): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(SUBTASKS_STORE, 'readwrite')
  const store = transaction.objectStore(SUBTASKS_STORE)
  const existing = (await requestToPromise(store.get(id))) as SubtaskLink | undefined
  if (existing) {
    store.put({ ...existing, rank })
  }
  await transactionToPromise(transaction)
}

export async function deleteSubtaskLinksByParent(parentTaskId: number): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(SUBTASKS_STORE, 'readwrite')
  const store = transaction.objectStore(SUBTASKS_STORE)
  const index = store.index('by_parent')
  const keys = await requestToPromise(index.getAllKeys(parentTaskId))
  for (const key of keys) store.delete(key)
  await transactionToPromise(transaction)
}

export async function deleteSubtaskLinksByChild(childTaskId: number): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(SUBTASKS_STORE, 'readwrite')
  const store = transaction.objectStore(SUBTASKS_STORE)
  const index = store.index('by_child')
  const keys = await requestToPromise(index.getAllKeys(childTaskId))
  for (const key of keys) store.delete(key)
  await transactionToPromise(transaction)
}

export async function loadViews(): Promise<View[]> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(VIEWS_STORE, 'readonly')
  const store = transaction.objectStore(VIEWS_STORE)
  const views = (await requestToPromise(store.getAll())) as View[]
  await transactionToPromise(transaction)
  return views
}

export async function saveView(view: View): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(VIEWS_STORE, 'readwrite')
  const store = transaction.objectStore(VIEWS_STORE)
  store.put(view)
  await transactionToPromise(transaction)
}

export async function deleteView(slug: string): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(VIEWS_STORE, 'readwrite')
  const store = transaction.objectStore(VIEWS_STORE)
  store.delete(slug)
  await transactionToPromise(transaction)
}

export async function loadScheduledTransitions(taskId: number): Promise<ScheduledTransition[]> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(SCHEDULED_TRANSITIONS_STORE, 'readonly')
  const store = transaction.objectStore(SCHEDULED_TRANSITIONS_STORE)
  const records = (await requestToPromise(store.getAll())) as StoredScheduledTransition[]
  const keys = await requestToPromise(store.getAllKeys())
  await transactionToPromise(transaction)

  return records
    .map((record, index) => ({ id: keyToTaskId(keys[index]), ...record }))
    .filter((t) => t.taskId === taskId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export async function addScheduledTransition(taskId: number, date: string, statusSlug: string): Promise<ScheduledTransition> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(SCHEDULED_TRANSITIONS_STORE, 'readwrite')
  const store = transaction.objectStore(SCHEDULED_TRANSITIONS_STORE)
  const stored: StoredScheduledTransition = { taskId, date, statusSlug }
  const key = await requestToPromise(store.add(stored))
  await transactionToPromise(transaction)
  return { id: keyToTaskId(key), taskId, date, statusSlug }
}

export async function deleteScheduledTransition(id: number): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(SCHEDULED_TRANSITIONS_STORE, 'readwrite')
  const store = transaction.objectStore(SCHEDULED_TRANSITIONS_STORE)
  store.delete(id)
  await transactionToPromise(transaction)
}

export async function loadAllDueTransitions(): Promise<ScheduledTransition[]> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(SCHEDULED_TRANSITIONS_STORE, 'readonly')
  const store = transaction.objectStore(SCHEDULED_TRANSITIONS_STORE)
  const records = (await requestToPromise(store.getAll())) as StoredScheduledTransition[]
  const keys = await requestToPromise(store.getAllKeys())
  await transactionToPromise(transaction)

  const today = new Date().toISOString().slice(0, 10)
  return records
    .map((record, index) => ({ id: keyToTaskId(keys[index]), ...record }))
    .filter((t) => t.date <= today)
}

export async function loadBlocks(taskId: number): Promise<BlockingRelationship[]> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(RELATIONSHIPS_STORE, 'readonly')
  const store = transaction.objectStore(RELATIONSHIPS_STORE)

  const fromIndex = store.index('fromTaskId')
  const toIndex = store.index('toTaskId')

  const fromRecords = (await requestToPromise(fromIndex.getAll(taskId))) as StoredBlockingRelationship[]
  const fromKeys = await requestToPromise(fromIndex.getAllKeys(taskId))
  const toRecords = (await requestToPromise(toIndex.getAll(taskId))) as StoredBlockingRelationship[]
  const toKeys = await requestToPromise(toIndex.getAllKeys(taskId))
  await transactionToPromise(transaction)

  const from = fromRecords.map((r, i) => ({ ...r, id: keyToTaskId(fromKeys[i]) }))
  const to = toRecords.map((r, i) => ({ ...r, id: keyToTaskId(toKeys[i]) }))
  return [...from, ...to]
}

export async function loadAllBlocks(): Promise<BlockingRelationship[]> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(RELATIONSHIPS_STORE, 'readonly')
  const store = transaction.objectStore(RELATIONSHIPS_STORE)

  const records = (await requestToPromise(store.getAll())) as StoredBlockingRelationship[]
  const keys = await requestToPromise(store.getAllKeys())
  await transactionToPromise(transaction)

  return records.map((r, i) => ({ ...r, id: keyToTaskId(keys[i]) }))
}

export async function addBlock(fromTaskId: number, toTaskId: number, type: 'blocks'): Promise<BlockingRelationship> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(RELATIONSHIPS_STORE, 'readwrite')
  const store = transaction.objectStore(RELATIONSHIPS_STORE)
  const stored: StoredBlockingRelationship = { fromTaskId, toTaskId, type }
  const key = await requestToPromise(store.add(stored))
  await transactionToPromise(transaction)
  return { id: keyToTaskId(key), fromTaskId, toTaskId, type }
}

export async function deleteBlock(id: number): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(RELATIONSHIPS_STORE, 'readwrite')
  const store = transaction.objectStore(RELATIONSHIPS_STORE)
  store.delete(id)
  await transactionToPromise(transaction)
}

export async function deleteBlocksByTask(taskId: number): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(RELATIONSHIPS_STORE, 'readwrite')
  const store = transaction.objectStore(RELATIONSHIPS_STORE)
  const fromKeys = await requestToPromise(store.index('fromTaskId').getAllKeys(taskId))
  const toKeys = await requestToPromise(store.index('toTaskId').getAllKeys(taskId))
  for (const key of [...fromKeys, ...toKeys]) store.delete(key)
  await transactionToPromise(transaction)
}
