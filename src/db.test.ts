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

describe('loadStatuses (simple read)', () => {
  it('returns the seeded default statuses on a fresh database', async () => {
    const db = await import('./db')

    const statuses = await db.loadStatuses()

    // STATUSES_STORE is keyed by `slug`, so getAll() returns records in key
    // (alphabetical) order rather than insertion order.
    expect(statuses).toEqual([
      { slug: 'archived', name: 'Archived' },
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
    expect(tasks[3]).toMatchObject({ id: 4, name: 'New task', done: false, statusSlug: 'today', notes: '' })
  })
})

describe('updateStatus (multi-store write)', () => {
  it('renames a status slug and cascades the rename to tasks and views in one transaction', async () => {
    const db = await import('./db')

    await db.createStatus('Custom', 'custom')
    const task = await db.createTask('Task in custom status', LexoRank.middle().toString(), 'custom')
    await db.saveView({ slug: 'custom-view', name: 'Custom View', statusSlugs: ['custom', 'backlog'] })

    await db.updateStatus('custom', 'custom-renamed', 'Custom Renamed')

    const statuses = await db.loadStatuses()
    expect(statuses.some((s) => s.slug === 'custom')).toBe(false)
    expect(statuses).toContainEqual({ slug: 'custom-renamed', name: 'Custom Renamed' })

    const tasks = await db.loadTasks()
    expect(tasks.find((t) => t.id === task.id)?.statusSlug).toBe('custom-renamed')

    const views = await db.loadViews()
    expect(views.find((v) => v.slug === 'custom-view')?.statusSlugs).toEqual(['custom-renamed', 'backlog'])
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

describe('migration replay', () => {
  it('upgrades a v1 database (tasks store only, no done/rank/statusSlug/notes) to v8', async () => {
    // Simulate a database left behind by the very first shipped schema: only
    // the tasks store exists, and records predate the done/rank/statusSlug/notes fields.
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
    expect(legacy).toMatchObject({ done: false, statusSlug: 'backlog', notes: '' })
    expect(typeof legacy?.rank).toBe('string')
    expect(legacy?.rank.length).toBeGreaterThan(0)

    const statuses = await db.loadStatuses()
    expect(statuses.map((s) => s.slug).sort()).toEqual(['archived', 'backlog', 'today', 'today-extra'])

    const views = await db.loadViews()
    expect(views.map((v) => v.slug).sort()).toEqual(['archived', 'backlog', 'today', 'today-extra'])

    // Confirm the upgrade chain actually landed on version 8 and won't fire another upgrade.
    await new Promise<void>((resolve, reject) => {
      const verifyRequest = indexedDB.open(DB_NAME)
      verifyRequest.onupgradeneeded = () => reject(new Error('unexpected upgrade needed; migration did not reach version 8'))
      verifyRequest.onsuccess = () => {
        expect(verifyRequest.result.version).toBe(8)
        verifyRequest.result.close()
        resolve()
      }
      verifyRequest.onerror = () => reject(verifyRequest.error)
    })
  })
})
