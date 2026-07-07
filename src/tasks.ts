export type Task = {
  id: number
  name: string
}

export type TaskDraft = {
  name: string
}

const DB_NAME = 'todo-app'
const DB_VERSION = 1
const TASKS_STORE = 'tasks'
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

export async function loadTasks(): Promise<Task[]> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(TASKS_STORE, 'readonly')
  const store = transaction.objectStore(TASKS_STORE)
  const taskNames = (await requestToPromise(store.getAll())) as TaskDraft[]
  const taskKeys = await requestToPromise(store.getAllKeys())
  await transactionToPromise(transaction)

  return taskNames.map((task, index) => ({
    id: keyToTaskId(taskKeys[index]),
    name: task.name,
  }))
}

export async function saveTask(task: TaskDraft): Promise<Task> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  const taskId = await requestToPromise(store.add(task))
  await transactionToPromise(transaction)

  return {
    id: keyToTaskId(taskId),
    name: task.name,
  }
}

export async function saveTasks(tasks: TaskDraft[]): Promise<void> {
  const db = await openTasksDatabase()

  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)

  await requestToPromise(store.clear())
  for (const task of tasks) {
    store.add(task)
  }

  await transactionToPromise(transaction)
}
