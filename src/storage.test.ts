import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  getAutoArchiveEnabled,
  readSelectedSourceId,
  SELECTED_SOURCE_ID_KEY,
  selectableTasks,
  setAutoArchiveEnabled,
  useLocalStorageSetting,
} from './storage'
import type { Task } from './types'

beforeEach(() => {
  localStorage.clear()
})

function makeTask(id: number, archivedAt: string | null): Task {
  return { id, name: `Task ${id}`, completedAt: null, archivedAt, rank: '0', statusSlug: 'today', notes: '', sourceId: 'indexeddb' }
}

describe('getAutoArchiveEnabled / setAutoArchiveEnabled', () => {
  it('defaults to false when unset', () => {
    expect(getAutoArchiveEnabled()).toBe(false)
  })

  it('reflects a value set to true', () => {
    setAutoArchiveEnabled(true)
    expect(getAutoArchiveEnabled()).toBe(true)
  })

  it('reflects a value set back to false', () => {
    setAutoArchiveEnabled(true)
    setAutoArchiveEnabled(false)
    expect(getAutoArchiveEnabled()).toBe(false)
  })
})

describe('readSelectedSourceId', () => {
  it('returns null when unset', () => {
    expect(readSelectedSourceId()).toBeNull()
  })

  // The chosen source is written via useLocalStorageSetting (a plain
  // localStorage.setItem under SELECTED_SOURCE_ID_KEY), so a reload is just a
  // fresh read of that same key.
  it('reflects a persisted value, surviving a simulated reload', () => {
    localStorage.setItem(SELECTED_SOURCE_ID_KEY, 'some-other-source')
    expect(readSelectedSourceId()).toBe('some-other-source')
  })
})

describe('useLocalStorageSetting with the selected-source setting (issue #255)', () => {
  it('persists a selected source id and reflects it back after a simulated reload', () => {
    const { result } = renderHook(() => useLocalStorageSetting<string>(SELECTED_SOURCE_ID_KEY))
    expect(result.current[0]).toBeNull()

    act(() => result.current[1]('indexeddb'))
    expect(readSelectedSourceId()).toBe('indexeddb')

    // A fresh hook mount reads whatever the previous mount persisted, the same
    // way MainPage would after a full app reload.
    const { result: afterReload } = renderHook(() => useLocalStorageSetting<string>(SELECTED_SOURCE_ID_KEY))
    expect(afterReload.current[0]).toBe('indexeddb')
  })
})

describe('selectableTasks', () => {
  it('excludes tasks that have already been archived', () => {
    const tasks = [makeTask(1, null), makeTask(2, '2026-07-14'), makeTask(3, null)]
    const result = selectableTasks(tasks, { currentTaskId: 1 })
    expect(result.map((t) => t.id)).toEqual([3])
  })

  it('excludes the current task and explicitly excluded ids in addition to archived ones', () => {
    const tasks = [makeTask(1, null), makeTask(2, '2026-07-14'), makeTask(3, null), makeTask(4, null)]
    const result = selectableTasks(tasks, { currentTaskId: 1, excludedIds: new Set([4]) })
    expect(result.map((t) => t.id)).toEqual([3])
  })
})
