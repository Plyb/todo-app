import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TasksProvider } from './TasksProvider'
import { useViews } from './tasks-context'

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
