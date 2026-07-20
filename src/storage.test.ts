import { beforeEach, describe, expect, it } from 'vitest'
import { getAutoArchiveEnabled, selectableTasks, setAutoArchiveEnabled } from './storage'
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
