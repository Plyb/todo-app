import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { LexoRank } from 'lexorank'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TasksProvider } from './TasksProvider'
import { useTasks, useViews } from './tasks-context'
import { setAutoArchiveEnabled, writeCurrentViewId, writeRecentViewIds } from './storage'
import { ARCHIVE_VIEW_ID } from './synthetic-view-utils'
import * as db from './db'

// Fresh indexedDB + localStorage per test so view state (seeded one-view-per-status
// on migration, see db/client.ts's migrateAddViews) and persisted currentViewId/
// recentViewIds don't leak between tests.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
})

function renderViews() {
  const wrapper = ({ children }: { children: ReactNode }) => <TasksProvider>{children}</TasksProvider>
  return renderHook(() => useViews(), { wrapper })
}

function renderTasks() {
  const wrapper = ({ children }: { children: ReactNode }) => <TasksProvider>{children}</TasksProvider>
  return renderHook(() => useTasks(), { wrapper })
}

describe('deleteView navigation', () => {
  it('navigates to the next-most-recently-opened surviving view when deleting the current view', async () => {
    const { result } = renderViews()
    await waitFor(() => expect(result.current.views.length).toBeGreaterThan(0))

    const [viewA, viewB, viewC] = result.current.views.map((v) => v.id)

    act(() => result.current.openView(viewB))
    act(() => result.current.openView(viewC))
    expect(result.current.currentViewId).toBe(viewC)

    await act(async () => {
      await result.current.deleteView(viewC)
    })

    expect(result.current.currentViewId).toBe(viewB)
    expect(result.current.recentViewIds).not.toContain(viewC)
    expect(result.current.views.some((v) => v.id === viewC)).toBe(false)
    expect(viewA).toBeDefined()
  })

  it('leaves currentViewId untouched when deleting a non-current view', async () => {
    const { result } = renderViews()
    await waitFor(() => expect(result.current.views.length).toBeGreaterThan(0))

    const [viewA, viewB] = result.current.views.map((v) => v.id)

    // Put viewB in the recent history, then navigate back to viewA so viewB
    // is a non-current view with recent history of its own.
    act(() => result.current.openView(viewB))
    act(() => result.current.openView(viewA))
    expect(result.current.currentViewId).toBe(viewA)

    await act(async () => {
      await result.current.deleteView(viewB)
    })

    expect(result.current.currentViewId).toBe(viewA)
    expect(result.current.recentViewIds).not.toContain(viewB)
  })

  it('falls back to the first remaining view when there is no other recent history', async () => {
    // The db connection (and its data) is cached across tests in this describe
    // block rather than truly reset per test (see beforeEach above), and the
    // two preceding tests each permanently delete one view from the shared
    // pool of default views. Seed an extra view so this test always has at
    // least one to fall back to, regardless of how much the earlier tests
    // already consumed.
    await db.saveView({ id: 'fallback-spare', name: 'Fallback Spare', statusSlugs: ['backlog'] })

    const { result } = renderViews()
    await waitFor(() => expect(result.current.views.length).toBeGreaterThan(0))

    // Fresh provider: currentViewId defaults to the first loaded view, and
    // recentViewIds has no other entries to fall back on.
    const initialId = result.current.currentViewId
    const remainingIds = result.current.views.map((v) => v.id).filter((s) => s !== initialId)
    expect(result.current.recentViewIds).toEqual([initialId])

    await act(async () => {
      await result.current.deleteView(initialId)
    })

    expect(result.current.currentViewId).toBe(remainingIds[0])
    expect(result.current.recentViewIds).not.toContain(initialId)
  })
})

describe('archive sentinel id persistence', () => {
  it('restores the archive view as currentViewId on mount when it was the last-open view', async () => {
    // Simulate a reload where the sentinel was persisted as the last-open view.
    writeCurrentViewId(ARCHIVE_VIEW_ID)

    const { result } = renderViews()
    await waitFor(() => expect(result.current.views.length).toBeGreaterThan(0))

    expect(result.current.currentViewId).toBe(ARCHIVE_VIEW_ID)
  })

  it('does not prune the archive sentinel id out of recentViewIds on mount', async () => {
    writeRecentViewIds([ARCHIVE_VIEW_ID])

    const { result } = renderViews()
    await waitFor(() => expect(result.current.views.length).toBeGreaterThan(0))

    expect(result.current.recentViewIds).toEqual([ARCHIVE_VIEW_ID])
  })

  it('does not prune the archive sentinel id out of recentViewIds when an unrelated view is deleted', async () => {
    const { result } = renderViews()
    await waitFor(() => expect(result.current.views.length).toBeGreaterThan(0))

    // Add a throwaway view to delete, rather than assuming >=2 views already
    // exist - the db connection (and its view store) is shared across tests
    // in this file (see openDatabasePromise caching in db/client.ts), so the
    // ambient view count left over from other tests isn't reliable here.
    const anchorId = result.current.views[0].id
    await act(async () => {
      await result.current.saveView({ id: 'temp-view-to-delete', name: 'Temp', statusSlugs: [] })
    })

    act(() => result.current.openView(ARCHIVE_VIEW_ID))
    act(() => result.current.openView(anchorId))
    expect(result.current.recentViewIds).toContain(ARCHIVE_VIEW_ID)

    await act(async () => {
      await result.current.deleteView('temp-view-to-delete')
    })

    expect(result.current.recentViewIds).toContain(ARCHIVE_VIEW_ID)
  })
})

describe('setStatus rank', () => {
  it('recomputes rank so the task does not collide with an existing rank in the destination status', async () => {
    const { result } = renderTasks()
    act(() => result.current.requestTaskPage('today'))
    await waitFor(() => expect(result.current.tasks.length).toBeGreaterThan(0))

    const buyGroceries = result.current.tasks.find((t) => t.name === 'Buy groceries')!
    expect(buyGroceries.statusSlug).toBe('today')

    // Seed a backlog task with the exact same rank 'Buy groceries' already has, so
    // moving it into backlog without recomputing rank would produce a tie.
    await act(async () => {
      await result.current.createTask('Colliding backlog task', buyGroceries.rank, 'backlog')
    })

    await act(async () => {
      await result.current.setStatus(buyGroceries.id, 'backlog')
    })

    const backlogRanks = result.current.tasks.filter((t) => t.statusSlug === 'backlog').map((t) => t.rank)
    expect(new Set(backlogRanks).size).toBe(backlogRanks.length)
  })
})

describe('auto-archive scan effect', () => {
  it('sets archivedAt without changing statusSlug when auto-archive is enabled and a task is eligible', async () => {
    // Seed a task directly in the db, already completed on an earlier calendar
    // day, so it's eligible for archiving as soon as the provider mounts. This
    // avoids relying on setDone (which always stamps completedAt as today).
    const seeded = await db.createTask('Eligible task', '0', 'today')
    await db.updateTaskCompletedAt(seeded.id, '2020-01-01')
    setAutoArchiveEnabled(true)

    const { result } = renderTasks()
    act(() => result.current.requestTaskPage('today'))
    await waitFor(() => {
      const updated = result.current.tasks.find((t) => t.id === seeded.id)
      expect(updated).toBeDefined()
      expect(updated!.archivedAt).not.toBeNull()
    })

    const archivedTask = result.current.tasks.find((t) => t.id === seeded.id)!
    expect(archivedTask.statusSlug).toBe('today')
  })

  it('leaves eligible tasks unarchived when auto-archive is disabled', async () => {
    const seeded = await db.createTask('Eligible task', '0', 'today')
    await db.updateTaskCompletedAt(seeded.id, '2020-01-01')

    const { result } = renderTasks()
    act(() => result.current.requestTaskPage('today'))
    await waitFor(() => expect(result.current.tasks.length).toBeGreaterThan(0))

    const stillUnarchived = result.current.tasks.find((t) => t.id === seeded.id)!
    expect(stillUnarchived.archivedAt).toBeNull()
  })
})

describe('daily rerank scan effect', () => {
  it('shortens a too-long rank and persists it, without touching a normal-length rank in another status', async () => {
    const longRank = 'a'.repeat(30)
    const long = await db.createTask('Long rank task', longRank, 'today')
    const short = await db.createTask('Short rank task', '0', 'backlog')

    const { result } = renderTasks()
    act(() => result.current.requestTaskPage('today'))
    act(() => result.current.requestTaskPage('backlog'))
    await waitFor(() => {
      const updated = result.current.tasks.find((t) => t.id === long.id)
      expect(updated).toBeDefined()
      expect(updated!.rank.length).toBeLessThan(30)
    })

    const rerankedLong = result.current.tasks.find((t) => t.id === long.id)!
    expect(rerankedLong.statusSlug).toBe('today')

    const untouchedShort = result.current.tasks.find((t) => t.id === short.id)!
    expect(untouchedShort.rank).toBe('0')

    const persisted = await db.loadTasks()
    expect(persisted.find((t) => t.id === long.id)!.rank).toBe(rerankedLong.rank)
  })

  it('leaves ranks untouched when no task has an over-threshold rank', async () => {
    const seeded = await db.createTask('Normal task', '0', 'today')

    const { result } = renderTasks()
    act(() => result.current.requestTaskPage('today'))
    await waitFor(() => expect(result.current.tasks.length).toBeGreaterThan(0))

    const unchanged = result.current.tasks.find((t) => t.id === seeded.id)!
    expect(unchanged.rank).toBe('0')
  })

  it('excludes archived tasks from being reassigned a rank', async () => {
    const longRank = 'a'.repeat(30)
    const archived = await db.createTask('Archived task', longRank, 'today')
    await db.updateTaskArchivedAt(archived.id, '2020-01-01')

    const { result } = renderTasks()
    // The archived task is excluded from the 'today' status section's page (it's
    // no longer displayed there), so it only enters memory via the archived view's
    // own pagination - which is what this test needs, to prove rerank still skips it.
    act(() => result.current.requestTaskPage(ARCHIVE_VIEW_ID))
    await waitFor(() => expect(result.current.tasks.length).toBeGreaterThan(0))

    const stillLong = result.current.tasks.find((t) => t.id === archived.id)!
    expect(stillLong.rank).toBe(longRank)
  })
})

describe('lazy section pagination (issue #249)', () => {
  // The db connection (and its tasks store) is shared across every test in this
  // file (see openDatabasePromise caching in db/client.ts), so each test here
  // uses a statusSlug no other test in the file touches, keeping its section's
  // page contents exactly the tasks it creates.
  async function seedTasksInStatus(count: number, statusSlug: string) {
    let rank = LexoRank.middle()
    const created = []
    for (let i = 0; i < count; i++) {
      created.push(await db.createTask(`${statusSlug} task ${i}`, rank.toString(), statusSlug))
      rank = rank.genNext()
    }
    return created
  }

  it('does not load any tasks until a section is requested', async () => {
    await seedTasksInStatus(5, 'issue249-untouched')

    const { result } = renderTasks()
    // Nothing else in this test ever calls requestTaskPage, so tasks should
    // stay empty rather than the old "load everything at startup" behavior.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(result.current.tasks).toEqual([])
  })

  it('loads a first page of TASK_PAGE_SIZE tasks, then a second page on a further request', async () => {
    const statusSlug = 'issue249-two-pages'
    const created = await seedTasksInStatus(db.TASK_PAGE_SIZE + 5, statusSlug)

    const { result } = renderTasks()
    act(() => result.current.requestTaskPage(statusSlug))

    await waitFor(() => expect(result.current.tasks).toHaveLength(db.TASK_PAGE_SIZE))
    expect(result.current.tasks.map((t) => t.id)).toEqual(created.slice(0, db.TASK_PAGE_SIZE).map((t) => t.id))
    expect(result.current.sectionPaging[statusSlug].hasMore).toBe(true)

    act(() => result.current.requestTaskPage(statusSlug))

    await waitFor(() => expect(result.current.tasks).toHaveLength(created.length))
    expect(result.current.tasks.map((t) => t.id).sort((a, b) => a - b)).toEqual(
      created.map((t) => t.id).sort((a, b) => a - b)
    )
    expect(result.current.sectionPaging[statusSlug].hasMore).toBe(false)
  })

  it('marks the section as loading synchronously while its page request is in flight', async () => {
    const statusSlug = 'issue249-loading-flag'
    await seedTasksInStatus(3, statusSlug)

    const { result } = renderTasks()
    act(() => {
      result.current.requestTaskPage(statusSlug)
    })

    expect(result.current.sectionPaging[statusSlug].isLoading).toBe(true)

    await waitFor(() => expect(result.current.sectionPaging[statusSlug].isLoading).toBe(false))
  })

  it('sorts a normal section by rank and the archived section by archivedAt, independently', async () => {
    const statusSlug = 'issue249-sort-order'
    const olderArchived = await db.createTask('Older archived', LexoRank.middle().toString(), statusSlug)
    // Later than any other test's archived date in this shared-db file, so these
    // two sort to the very top of the (file-wide) archived section regardless of
    // what other tests have already archived.
    await db.updateTaskArchivedAt(olderArchived.id, '2026-01-01')
    const newerArchived = await db.createTask('Newer archived', LexoRank.middle().genNext().toString(), statusSlug)
    await db.updateTaskArchivedAt(newerArchived.id, '2026-06-01')
    const rankFirst = await db.createTask('Rank first', LexoRank.middle().genNext().genNext().toString(), statusSlug)

    const { result } = renderTasks()
    act(() => result.current.requestTaskPage(statusSlug))
    await waitFor(() => expect(result.current.tasks.some((t) => t.id === rankFirst.id)).toBe(true))

    // The status section excludes archived tasks and sorts by rank - only
    // rankFirst (not archived) shows up here.
    expect(result.current.tasks.map((t) => t.id)).toEqual([rankFirst.id])

    act(() => result.current.requestTaskPage(ARCHIVE_VIEW_ID))
    await waitFor(() => expect(result.current.tasks.some((t) => t.id === olderArchived.id)).toBe(true))

    // The archived section sorts most-recently-archived first, unlike rank
    // order - filtered to just these two ids (other tests may have archived
    // tasks of their own in this shared db) to check their relative order.
    const orderedIds = result.current.tasks.map((t) => t.id).filter((id) => id === olderArchived.id || id === newerArchived.id)
    expect(orderedIds).toEqual([newerArchived.id, olderArchived.id])
  })
})
