import { describe, expect, it } from 'vitest'
import { isArchiveEligible, sortArchivedTasks } from './archive-utils'
import type { Task } from './types'

function makeTask(completedAt: string | null): Task {
  return { id: 1, name: 'Task', completedAt, archivedAt: null, rank: '0', statusSlug: 'today', notes: '' }
}

function makeArchivedTask(overrides: Partial<Task> & { id: number; name: string }): Task {
  return {
    completedAt: null,
    archivedAt: '2026-01-01',
    rank: '0',
    statusSlug: 'today',
    notes: '',
    ...overrides,
  }
}

describe('isArchiveEligible', () => {
  it('is not eligible when the task is not done', () => {
    expect(isArchiveEligible(makeTask(null), '2026-07-14')).toBe(false)
  })

  it('is not eligible when the task was completed today', () => {
    expect(isArchiveEligible(makeTask('2026-07-14'), '2026-07-14')).toBe(false)
  })

  it('is eligible once completed on an earlier calendar day', () => {
    expect(isArchiveEligible(makeTask('2026-07-13'), '2026-07-14')).toBe(true)
  })

  it('is eligible for a task completed many days ago', () => {
    expect(isArchiveEligible(makeTask('2026-01-01'), '2026-07-14')).toBe(true)
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
