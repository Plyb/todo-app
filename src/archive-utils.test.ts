import { describe, expect, it } from 'vitest'
import { isArchiveEligible } from './archive-utils'
import type { Task } from './types'

function makeTask(completedAt: string | null): Task {
  return { id: 1, name: 'Task', completedAt, rank: '0', statusSlug: 'today', notes: '' }
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
