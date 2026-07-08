import { LexoRank } from 'lexorank'

export type Task = {
  id: number
  name: string
  done: boolean
  rank: string
  notes: string
}

type StoredTask = Omit<Task, 'id'>

const DB_NAME = 'todo-app'
const DB_VERSION = 4
const TASKS_STORE = 'tasks'

const DEMO_TASKS: StoredTask[] = (() => {
  const middle = LexoRank.middle()
  return [
    { name: 'Buy groceries', done: false, rank: middle.toString(), notes: '' },
    { name: 'Walk the dog', done: false, rank: middle.genNext().toString(), notes: '' },
    { name: 'Write weekly update', done: false, rank: middle.genNext().genNext().toString(), notes: '' },
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

        // v3 -> v4: add notes field to existing records
        if (event.oldVersion < 4) {
          migrateAddNotes(transaction).catch(() => {
            // Migration errors will surface as transaction abort
          })
        }
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
      notes: task.notes ?? '',
    }))
    tasks.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
    return tasks
  }

  await seedDemoTasks(db)
  return loadTasks()
}

export async function createTask(name: string, rank: string): Promise<Task> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  const request = store.add({ name, done: false, rank, notes: '' })
  const key = await requestToPromise(request)
  await transactionToPromise(transaction)
  return { id: keyToTaskId(key), name, done: false, rank, notes: '' }
}

export async function saveTask(task: Task): Promise<void> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  store.put({ name: task.name, done: task.done, rank: task.rank, notes: task.notes }, task.id)
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

export async function deleteTask(id: number): Promise<void> {
  const db = await openTasksDatabase()
  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  store.delete(id)
  await transactionToPromise(transaction)
}
