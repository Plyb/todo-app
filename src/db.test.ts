import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { LexoRank } from 'lexorank'

const DB_NAME = 'todo-app'

// fake-indexeddb does not perfectly reproduce IndexedDB's transaction
// auto-commit timing, so these tests always go through db.ts's exported
// async functions (which await request/transaction completion) rather than
// racing raw IDBRequest callbacks.
beforeEach(() => {
  // Give every test its own empty database and reset db.ts's module-level
  // `openDatabasePromise` cache, so tests don't leak connections/state.
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
})

// Writes a record straight into a store, bypassing db.ts's typed helpers, so
// tests can seed malformed or legacy-shaped records the app itself never writes.
async function putRaw(storeName: string, value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME)
    request.onsuccess = () => {
      const rawDb = request.result
      const tx = rawDb.transaction(storeName, 'readwrite')
      tx.objectStore(storeName).put(value)
      tx.oncomplete = () => {
        rawDb.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
    request.onerror = () => reject(request.error)
  })
}

describe('loadStatuses (simple read)', () => {
  it('returns the seeded default statuses on a fresh database', async () => {
    const db = await import('./db')

    const statuses = await db.loadStatuses()

    // STATUSES_STORE is keyed by `slug`, so getAll() returns records in key
    // (alphabetical) order rather than insertion order.
    expect(statuses).toEqual([
      { slug: 'backlog', name: 'Backlog' },
      { slug: 'today', name: 'Today' },
      { slug: 'today-extra', name: 'Today Extra' },
    ])
  })
})

describe('createStatus (write round-trip)', () => {
  it('persists a new status so it is returned by a later loadStatuses call', async () => {
    const db = await import('./db')

    const created = await db.createStatus('Custom', 'custom')
    expect(created).toEqual({ slug: 'custom', name: 'Custom' })

    const statuses = await db.loadStatuses()
    expect(statuses).toContainEqual({ slug: 'custom', name: 'Custom' })
  })
})

describe('loadTasks (multi-request read: getAll + getAllKeys zip)', () => {
  it('seeds demo tasks on first load and assigns ids from getAllKeys in rank order', async () => {
    const db = await import('./db')

    const seeded = await db.loadTasks()
    expect(seeded.map((t) => t.name)).toEqual(['Buy groceries', 'Walk the dog', 'Write weekly update'])
    expect(seeded.map((t) => t.id)).toEqual([1, 2, 3])
    // Demo tasks are seeded in rank order already, so loadTasks's sort is a no-op here.
    expect([...seeded].sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))).toEqual(seeded)
  })

  it('reflects newly created tasks alongside the seeded ones, sorted by rank', async () => {
    const db = await import('./db')

    const seeded = await db.loadTasks()
    const lastRank = seeded[seeded.length - 1].rank
    const nextRank = LexoRank.parse(lastRank).genNext().toString()

    const created = await db.createTask('New task', nextRank, 'today')
    expect(created.id).toBe(4)

    const tasks = await db.loadTasks()
    expect(tasks.map((t) => t.name)).toEqual(['Buy groceries', 'Walk the dog', 'Write weekly update', 'New task'])
    expect(tasks[3]).toMatchObject({ id: 4, name: 'New task', completedAt: null, statusSlug: 'today', notes: '' })
  })
})

describe('updateStatus (multi-store write)', () => {
  it('renames a status slug and cascades the rename to tasks and views in one transaction', async () => {
    const db = await import('./db')

    await db.createStatus('Custom', 'custom')
    const task = await db.createTask('Task in custom status', LexoRank.middle().toString(), 'custom')
    await db.saveView({ id: 'custom-view', name: 'Custom View', statusSlugs: ['custom', 'backlog'] })

    await db.updateStatus('custom', 'custom-renamed', 'Custom Renamed')

    const statuses = await db.loadStatuses()
    expect(statuses.some((s) => s.slug === 'custom')).toBe(false)
    expect(statuses).toContainEqual({ slug: 'custom-renamed', name: 'Custom Renamed' })

    const tasks = await db.loadTasks()
    expect(tasks.find((t) => t.id === task.id)?.statusSlug).toBe('custom-renamed')

    const views = await db.loadViews()
    expect(views.find((v) => v.id === 'custom-view')?.statusSlugs).toEqual(['custom-renamed', 'backlog'])
  })
})

describe('deleteTask (atomic cascade)', () => {
  it('removes the task, its subtask links, and its blocking relationships together', async () => {
    const db = await import('./db')

    const parent = await db.createTask('Parent', LexoRank.middle().toString(), 'backlog')
    const child = await db.createTask('Child', LexoRank.middle().genNext().toString(), 'backlog')
    const other = await db.createTask('Other', LexoRank.middle().genNext().genNext().toString(), 'backlog')

    await db.createSubtaskLink(parent.id, child.id, LexoRank.middle().toString())
    await db.addBlock(parent.id, other.id, 'blocks')

    await db.deleteTask(parent.id)

    const tasks = await db.loadTasks()
    expect(tasks.find((t) => t.id === parent.id)).toBeUndefined()

    const subtaskLinks = await db.loadAllSubtaskLinks()
    expect(subtaskLinks.some((l) => l.parentTaskId === parent.id || l.childTaskId === parent.id)).toBe(false)

    const blocks = await db.loadAllBlocks()
    expect(blocks.some((b) => b.fromTaskId === parent.id || b.toTaskId === parent.id)).toBe(false)
  })
})

describe('updateTaskCompletedAt (guard against missing records)', () => {
  it('is a no-op when the task id does not exist, rather than creating a corrupted record', async () => {
    const db = await import('./db')
    const seeded = await db.loadTasks()

    await db.updateTaskCompletedAt(999, '2026-07-14')

    const tasks = await db.loadTasks()
    expect(tasks).toHaveLength(seeded.length)
    expect(tasks.some((t) => t.id === 999)).toBe(false)
  })
})

describe('runner abort-on-error (rolls back a partial multi-store write)', () => {
  it('aborts the transaction on a thrown callback, leaving the stores unchanged', async () => {
    const db = await import('./db')

    await db.createStatus('Custom', 'custom')
    const task = await db.createTask('Task in custom status', LexoRank.middle().toString(), 'custom')
    // A view missing `statusSlugs` makes `view.statusSlugs.includes(...)` throw
    // inside reassignTasksAndViews, after the status delete + task reassignment
    // have been queued in the same transaction.
    await putRaw('views', { id: 'malformed', name: 'Malformed' })

    await expect(db.updateStatus('custom', 'custom-renamed', 'Custom Renamed')).rejects.toThrow()

    // The abort must roll back the queued delete and task update.
    const statuses = await db.loadStatuses()
    expect(statuses).toContainEqual({ slug: 'custom', name: 'Custom' })
    expect(statuses.some((s) => s.slug === 'custom-renamed')).toBe(false)

    const tasks = await db.loadTasks()
    expect(tasks.find((t) => t.id === task.id)?.statusSlug).toBe('custom')
  })
})

describe('migration replay', () => {
  it('upgrades a v1 database (tasks store only, no completedAt/archivedAt/rank/statusSlug/notes) to v11', async () => {
    // Simulate a database left behind by the very first shipped schema: only
    // the tasks store exists, and records predate the completedAt/archivedAt/rank/statusSlug/notes fields.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('tasks', { autoIncrement: true })
      }
      request.onsuccess = () => {
        const legacyDb = request.result
        const tx = legacyDb.transaction('tasks', 'readwrite')
        tx.objectStore('tasks').add({ name: 'Legacy task' })
        tx.oncomplete = () => {
          legacyDb.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      request.onerror = () => reject(request.error)
    })

    vi.resetModules()
    const db = await import('./db')

    const tasks = await db.loadTasks()
    const legacy = tasks.find((t) => t.name === 'Legacy task')
    expect(legacy).toMatchObject({ completedAt: null, archivedAt: null, statusSlug: 'backlog', notes: '' })
    expect(typeof legacy?.rank).toBe('string')
    expect(legacy?.rank.length).toBeGreaterThan(0)

    const statuses = await db.loadStatuses()
    expect(statuses.map((s) => s.slug).sort()).toEqual(['backlog', 'today', 'today-extra'])

    const views = await db.loadViews()
    expect(views.map((v) => v.id).sort()).toEqual(['backlog', 'today', 'today-extra'])

    // Confirm the upgrade chain actually landed on version 11 and won't fire another upgrade.
    await new Promise<void>((resolve, reject) => {
      const verifyRequest = indexedDB.open(DB_NAME)
      verifyRequest.onupgradeneeded = () => reject(new Error('unexpected upgrade needed; migration did not reach version 11'))
      verifyRequest.onsuccess = () => {
        expect(verifyRequest.result.version).toBe(11)
        verifyRequest.result.close()
        resolve()
      }
      verifyRequest.onerror = () => reject(verifyRequest.error)
    })
  })

  it('upgrades an existing v10 database\'s VIEWS_STORE from slug-keyed to id-keyed records without losing data (issue #248 follow-up)', async () => {
    // Simulate a v10 database with real user-created views persisted under the
    // pre-migration `slug` keyPath.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 10)
      request.onupgradeneeded = () => {
        const upgradeDb = request.result
        upgradeDb.createObjectStore('tasks', { autoIncrement: true })
        upgradeDb.createObjectStore('statuses', { keyPath: 'slug' })
        upgradeDb.createObjectStore('views', { keyPath: 'slug' })
        upgradeDb.createObjectStore('scheduledTransitions', { autoIncrement: true })
        upgradeDb.createObjectStore('relationships', { autoIncrement: true })
        upgradeDb.createObjectStore('subtasks', { keyPath: 'id', autoIncrement: true })
      }
      request.onsuccess = () => {
        const legacyDb = request.result
        const tx = legacyDb.transaction('views', 'readwrite')
        tx.objectStore('views').add({ slug: 'today', name: 'Today', statusSlugs: ['today'] })
        tx.objectStore('views').add({ slug: 'custom-view', name: 'Custom View', statusSlugs: ['backlog', 'today'] })
        tx.oncomplete = () => {
          legacyDb.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      request.onerror = () => reject(request.error)
    })

    vi.resetModules()
    const db = await import('./db')

    const views = await db.loadViews()
    expect(views).toEqual(
      expect.arrayContaining([
        { id: 'today', name: 'Today', statusSlugs: ['today'] },
        { id: 'custom-view', name: 'Custom View', statusSlugs: ['backlog', 'today'] },
      ]),
    )
    expect(views).toHaveLength(2)

    // Confirm the raw store is actually keyed by `id` now, not `slug`.
    await new Promise<void>((resolve, reject) => {
      const verifyRequest = indexedDB.open(DB_NAME)
      verifyRequest.onsuccess = () => {
        const openedDb = verifyRequest.result
        const tx = openedDb.transaction('views', 'readonly')
        const keysRequest = tx.objectStore('views').getAllKeys()
        keysRequest.onsuccess = () => {
          expect(keysRequest.result.sort()).toEqual(['custom-view', 'today'])
          openedDb.close()
          resolve()
        }
        keysRequest.onerror = () => reject(keysRequest.error)
      }
      verifyRequest.onerror = () => reject(verifyRequest.error)
    })
  })
})

describe('migration integrity (raw store, issue #127)', () => {
  it('persists completedAt/rank/statusSlug into the raw store after a multi-version v1 -> v10 upgrade', async () => {
    // Seed a v1 database whose sole task record predates the
    // completedAt/rank/statusSlug/notes fields entirely.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('tasks', { autoIncrement: true })
      }
      request.onsuccess = () => {
        const legacyDb = request.result
        const tx = legacyDb.transaction('tasks', 'readwrite')
        tx.objectStore('tasks').add({ name: 'Legacy task' })
        tx.oncomplete = () => {
          legacyDb.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      request.onerror = () => reject(request.error)
    })

    // Trigger the full v1 -> v10 upgrade through db.ts.
    vi.resetModules()
    const db = await import('./db')
    await db.loadTasks()

    // Read the raw object store directly (NOT loadTasks) so we assert what the
    // migration actually PERSISTED, not what loadTasks defaults at read time.
    // If the concurrent-cursor race is present, completedAt/rank/statusSlug are
    // absent from storage and only notes survives.
    const rawRecord = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME)
      request.onupgradeneeded = () => reject(new Error('unexpected upgrade needed; migration did not reach version 8'))
      request.onsuccess = () => {
        const openedDb = request.result
        const tx = openedDb.transaction('tasks', 'readonly')
        const getAll = tx.objectStore('tasks').getAll()
        getAll.onsuccess = () => {
          const records = getAll.result as Record<string, unknown>[]
          const legacy = records.find((r) => r.name === 'Legacy task')
          openedDb.close()
          if (!legacy) {
            reject(new Error('legacy task not found in raw store'))
            return
          }
          resolve(legacy)
        }
        getAll.onerror = () => reject(getAll.error)
      }
      request.onerror = () => reject(request.error)
    })

    expect(rawRecord.completedAt).toBe(null)
    expect(typeof rawRecord.rank).toBe('string')
    expect((rawRecord.rank as string).length).toBeGreaterThan(0)
    expect(rawRecord.statusSlug).toBe('backlog')
    expect(rawRecord.notes).toBe('')
  })
})

describe('readTasks validation (Zod schema at the read boundary)', () => {
  it('defaults completedAt/archivedAt/rank/statusSlug/notes when a record at DB_VERSION 10 is still missing them', async () => {
    const db = await import('./db')
    await db.loadTasks() // opens the db at DB_VERSION 10 and seeds demo tasks

    await putRaw('tasks', { name: 'Stuck on old backfill' })

    const tasks = await db.loadTasks()
    const legacy = tasks.find((t) => t.name === 'Stuck on old backfill')
    expect(legacy).toMatchObject({ completedAt: null, archivedAt: null, statusSlug: 'backlog', notes: '' })
    expect(typeof legacy?.rank).toBe('string')
    expect(legacy?.rank.length).toBeGreaterThan(0)
  })

  it('throws rather than silently coercing a record with a wrong-typed field', async () => {
    const db = await import('./db')
    await db.loadTasks()

    await putRaw('tasks', { name: 'Bad task', completedAt: 42, rank: 'a', statusSlug: 'backlog', notes: '' })

    await expect(db.loadTasks()).rejects.toThrow()
  })
})

describe('migrating done to completedAt (issue #167)', () => {
  it('converts a legacy done:true record to a completedAt of today, giving it a day of grace before archiving', async () => {
    // Seed a v8 database (pre-#167) with a raw `done` boolean, no completedAt.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 8)
      request.onupgradeneeded = () => {
        const upgradeDb = request.result
        upgradeDb.createObjectStore('tasks', { autoIncrement: true })
        upgradeDb.createObjectStore('statuses', { keyPath: 'slug' })
        upgradeDb.createObjectStore('views', { keyPath: 'slug' })
        upgradeDb.createObjectStore('scheduledTransitions', { autoIncrement: true })
        upgradeDb.createObjectStore('relationships', { autoIncrement: true })
        upgradeDb.createObjectStore('subtasks', { keyPath: 'id', autoIncrement: true })
      }
      request.onsuccess = () => {
        const legacyDb = request.result
        const tx = legacyDb.transaction('tasks', 'readwrite')
        tx.objectStore('tasks').add({ name: 'Done task', done: true, rank: 'a', statusSlug: 'backlog', notes: '' })
        tx.objectStore('tasks').add({ name: 'Not done task', done: false, rank: 'b', statusSlug: 'backlog', notes: '' })
        tx.oncomplete = () => {
          legacyDb.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      request.onerror = () => reject(request.error)
    })

    vi.resetModules()
    const db = await import('./db')
    const tasks = await db.loadTasks()

    const today = new Date().toISOString().slice(0, 10)
    expect(tasks.find((t) => t.name === 'Done task')?.completedAt).toBe(today)
    expect(tasks.find((t) => t.name === 'Not done task')?.completedAt).toBe(null)
  })
})

describe('remaining-store read validation (Zod schema at the read boundary)', () => {
  it('loadStatuses throws on a wrong-typed field', async () => {
    const db = await import('./db')
    await db.loadStatuses()

    await putRaw('statuses', { slug: 'bad', name: 42 })

    await expect(db.loadStatuses()).rejects.toThrow()
  })

  it('loadViews throws on a wrong-typed field', async () => {
    const db = await import('./db')
    await db.loadViews()

    await putRaw('views', { id: 'bad', name: 'Bad', statusSlugs: 'not-an-array' })

    await expect(db.loadViews()).rejects.toThrow()
  })

  it('loadAllSubtaskLinks throws on a wrong-typed field', async () => {
    const db = await import('./db')
    const parent = await db.createTask('Parent', LexoRank.middle().toString(), 'backlog')
    const child = await db.createTask('Child', LexoRank.middle().genNext().toString(), 'backlog')

    await putRaw('subtasks', { parentTaskId: parent.id, childTaskId: child.id, rank: 42 })

    await expect(db.loadAllSubtaskLinks()).rejects.toThrow()
  })

  it('loadAllBlocks throws on a wrong-typed field', async () => {
    const db = await import('./db')
    const a = await db.createTask('A', LexoRank.middle().toString(), 'backlog')
    const b = await db.createTask('B', LexoRank.middle().genNext().toString(), 'backlog')
    await db.addBlock(a.id, b.id, 'blocks')

    await putRaw('relationships', { fromTaskId: a.id, toTaskId: b.id, type: 'not-blocks' })

    await expect(db.loadAllBlocks()).rejects.toThrow()
  })

  it('loadAllDueTransitions throws on a wrong-typed field', async () => {
    const db = await import('./db')
    const task = await db.createTask('Task', LexoRank.middle().toString(), 'backlog')
    await db.addScheduledTransition(task.id, '2020-01-01', 'backlog')

    await putRaw('scheduledTransitions', { taskId: task.id, date: 20200101, statusSlug: 'backlog' })

    await expect(db.loadAllDueTransitions()).rejects.toThrow()
  })
})
