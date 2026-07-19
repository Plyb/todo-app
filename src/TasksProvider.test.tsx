import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TasksProvider } from './TasksProvider'
import { useTasks, useViews } from './tasks-context'
import { setAutoArchiveEnabled } from './storage'
import * as db from './db'

// Fresh indexedDB + localStorage per test so view state (seeded one-view-per-status
// on migration, see db/client.ts's migrateAddViews) and persisted currentViewSlug/
// recentViewSlugs don't leak between tests.
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

    const [viewA, viewB, viewC] = result.current.views.map((v) => v.slug)

    act(() => result.current.openView(viewB))
    act(() => result.current.openView(viewC))
    expect(result.current.currentViewSlug).toBe(viewC)

    await act(async () => {
      await result.current.deleteView(viewC)
    })

    expect(result.current.currentViewSlug).toBe(viewB)
    expect(result.current.recentViewSlugs).not.toContain(viewC)
    expect(result.current.views.some((v) => v.slug === viewC)).toBe(false)
    expect(viewA).toBeDefined()
  })

  it('leaves currentViewSlug untouched when deleting a non-current view', async () => {
    const { result } = renderViews()
    await waitFor(() => expect(result.current.views.length).toBeGreaterThan(0))

    const [viewA, viewB] = result.current.views.map((v) => v.slug)

    // Put viewB in the recent history, then navigate back to viewA so viewB
    // is a non-current view with recent history of its own.
    act(() => result.current.openView(viewB))
    act(() => result.current.openView(viewA))
    expect(result.current.currentViewSlug).toBe(viewA)

    await act(async () => {
      await result.current.deleteView(viewB)
    })

    expect(result.current.currentViewSlug).toBe(viewA)
    expect(result.current.recentViewSlugs).not.toContain(viewB)
  })

  it('falls back to the first remaining view when there is no other recent history', async () => {
    const { result } = renderViews()
    await waitFor(() => expect(result.current.views.length).toBeGreaterThan(0))

    // Fresh provider: currentViewSlug defaults to the first loaded view, and
    // recentViewSlugs has no other entries to fall back on.
    const initialSlug = result.current.currentViewSlug
    const remainingSlugs = result.current.views.map((v) => v.slug).filter((s) => s !== initialSlug)
    expect(result.current.recentViewSlugs).toEqual([initialSlug])

    await act(async () => {
      await result.current.deleteView(initialSlug)
    })

    expect(result.current.currentViewSlug).toBe(remainingSlugs[0])
    expect(result.current.recentViewSlugs).not.toContain(initialSlug)
  })
})

describe('setStatus rank', () => {
  it('recomputes rank so the task does not collide with an existing rank in the destination status', async () => {
    const { result } = renderTasks()
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
    await waitFor(() => expect(result.current.tasks.length).toBeGreaterThan(0))

    const stillUnarchived = result.current.tasks.find((t) => t.id === seeded.id)!
    expect(stillUnarchived.archivedAt).toBeNull()
  })
})
