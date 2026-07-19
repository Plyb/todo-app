import { describe, expect, it } from 'vitest'
import { displayedTasksForView, sectionTasksForStatus } from './view-utils'
import type { Task, View } from './types'

function makeTask(overrides: Partial<Task> & { id: number; name: string; statusSlug: string }): Task {
  return {
    completedAt: null,
    archivedAt: null,
    rank: '0',
    notes: '',
    ...overrides,
  }
}

describe('displayedTasksForView', () => {
  const view: View = { slug: 'view', name: 'View', statusSlugs: ['todo', 'doing'] }

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
