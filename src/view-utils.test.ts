import { describe, expect, it } from 'vitest'
import { displayedTasksForView, sectionTasksForStatus, sortArchivedTasks, type ArchivedTask } from './view-utils'
import type { Task, UserDefinedView } from './types'

function makeTask(overrides: Partial<Task> & { id: number; name: string; statusSlug: string }): Task {
  return {
    completedAt: null,
    archivedAt: null,
    rank: '0',
    notes: '',
    ...overrides,
  }
}

function makeArchivedTask(overrides: Partial<ArchivedTask> & { id: number; name: string }): ArchivedTask {
  return {
    completedAt: null,
    archivedAt: '2026-01-01',
    rank: '0',
    statusSlug: 'today',
    notes: '',
    ...overrides,
  }
}

describe('displayedTasksForView', () => {
  const view: UserDefinedView = { id: 'view', name: 'View', statusSlugs: ['todo', 'doing'] }

  it('includes tasks whose status is in the view', () => {
    const task = makeTask({ id: 1, name: 'A', statusSlug: 'todo' })
    expect(displayedTasksForView([task], view)).toEqual([task])
  })

  it('excludes tasks whose status is not in the view', () => {
    const task = makeTask({ id: 1, name: 'A', statusSlug: 'done' })
    expect(displayedTasksForView([task], view)).toEqual([])
  })

  it('excludes archived tasks even when their status is in the view', () => {
    const task = makeTask({ id: 1, name: 'A', statusSlug: 'todo', archivedAt: '2026-01-01' })
    expect(displayedTasksForView([task], view)).toEqual([])
  })
})

describe('sectionTasksForStatus', () => {
  it('includes tasks matching the status slug', () => {
    const task = makeTask({ id: 1, name: 'A', statusSlug: 'todo' })
    expect(sectionTasksForStatus([task], 'todo')).toEqual([task])
  })

  it('excludes tasks with a different status slug', () => {
    const task = makeTask({ id: 1, name: 'A', statusSlug: 'done' })
    expect(sectionTasksForStatus([task], 'todo')).toEqual([])
  })

  it('excludes archived tasks even when their status matches', () => {
    const task = makeTask({ id: 1, name: 'A', statusSlug: 'todo', archivedAt: '2026-01-01' })
    expect(sectionTasksForStatus([task], 'todo')).toEqual([])
  })
})

describe('sortArchivedTasks', () => {
  it('orders by archivedAt, most recently archived first', () => {
    const older = makeArchivedTask({ id: 1, name: 'Older', archivedAt: '2026-01-01' })
    const newer = makeArchivedTask({ id: 2, name: 'Newer', archivedAt: '2026-06-01' })

    expect(sortArchivedTasks([older, newer])).toEqual([newer, older])
  })

  it('breaks archivedAt ties by completedAt, most recently completed first', () => {
    const completedEarlier = makeArchivedTask({ id: 1, name: 'A', archivedAt: '2026-01-01', completedAt: '2025-12-01' })
    const completedLater = makeArchivedTask({ id: 2, name: 'B', archivedAt: '2026-01-01', completedAt: '2025-12-15' })

    expect(sortArchivedTasks([completedEarlier, completedLater])).toEqual([completedLater, completedEarlier])
  })

  it('breaks archivedAt and completedAt ties alphabetically by name', () => {
    const zebra = makeArchivedTask({ id: 1, name: 'Zebra', archivedAt: '2026-01-01', completedAt: '2025-12-01' })
    const apple = makeArchivedTask({ id: 2, name: 'Apple', archivedAt: '2026-01-01', completedAt: '2025-12-01' })

    expect(sortArchivedTasks([zebra, apple])).toEqual([apple, zebra])
  })

  it('does not mutate the input array', () => {
    const a = makeArchivedTask({ id: 1, name: 'A', archivedAt: '2026-01-01' })
    const b = makeArchivedTask({ id: 2, name: 'B', archivedAt: '2026-02-01' })
    const tasks = [a, b]

    sortArchivedTasks(tasks)

    expect(tasks).toEqual([a, b])
  })
})
