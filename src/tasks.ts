export type Task = {
  id: number
  name: string
}

type StoredTask = Pick<Task, 'name'>

const DB_NAME = 'todo-app'
const DB_VERSION = 1
const TASKS_STORE = 'tasks'

const DEMO_TASKS: StoredTask[] = [
  { name: 'Buy groceries' },
  { name: 'Walk the dog' },
  { name: 'Write weekly update' },
]

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

async function openTasksDatabase(): Promise<IDBDatabase> {
  if (openDatabasePromise) {
    return openDatabasePromise
  }

  openDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        db.createObjectStore(TASKS_STORE, { autoIncrement: true })
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
    return storedTasks.map((task, index) => ({
      id: keyToTaskId(taskKeys[index]),
      name: task.name,
    }))
  }

  await seedDemoTasks(db)
  return loadTasks()
}

export async function saveTask(task: Task): Promise<void> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  store.put({ name: task.name }, task.id)
  await transactionToPromise(transaction)
}
