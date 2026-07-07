export type Task = {
  id: number
  name: string
}

const DEMO_TASKS: Task[] = [
  { id: 1, name: 'Buy groceries' },
  { id: 2, name: 'Walk the dog' },
  { id: 3, name: 'Write weekly update' },
]

const DATABASE_NAME = 'todo-app'
const DATABASE_VERSION = 1
const TASK_STORE_NAME = 'tasks'

let openDatabasePromise: Promise<IDBDatabase> | undefined

function getDatabase() {
  if (!openDatabasePromise) {
    openDatabasePromise = new Promise((resolve, reject) => {
      const openRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

      openRequest.addEventListener('upgradeneeded', () => {
        const database = openRequest.result
        if (!database.objectStoreNames.contains(TASK_STORE_NAME)) {
          database.createObjectStore(TASK_STORE_NAME, { keyPath: 'id' })
        }
      })

      openRequest.addEventListener('success', () => resolve(openRequest.result))
      openRequest.addEventListener('error', () => reject(openRequest.error))
    })
  }

  return openDatabasePromise
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error))
  })
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve())
    transaction.addEventListener('abort', () => reject(transaction.error))
    transaction.addEventListener('error', () => reject(transaction.error))
  })
}

async function seedDemoTasks(database: IDBDatabase) {
  const transaction = database.transaction(TASK_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(TASK_STORE_NAME)

  for (const task of DEMO_TASKS) {
    store.put(task)
  }

  await transactionToPromise(transaction)
}

export async function loadTasks() {
  const database = await getDatabase()
  const transaction = database.transaction(TASK_STORE_NAME, 'readonly')
  const store = transaction.objectStore(TASK_STORE_NAME)
  const tasks = await requestToPromise(store.getAll())
  await transactionToPromise(transaction)

  if (tasks.length > 0) {
    return tasks
  }

  await seedDemoTasks(database)
  return DEMO_TASKS
}
