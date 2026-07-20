import { describe, expect, it } from 'vitest'
import { LexoRank } from 'lexorank'
import { needsRerank, rerankStatusGroup, RERANK_RANK_LENGTH_THRESHOLD } from './rerank-utils'
import type { Task } from './types'

function makeTask(overrides: Partial<Task> & { id: number; rank: string }): Task {
  return {
    name: `Task ${overrides.id}`,
    completedAt: null,
    archivedAt: null,
    statusSlug: 'backlog',
    notes: '',
    sourceId: 'indexeddb',
    ...overrides,
  }
}

describe('needsRerank', () => {
  it('is false when no task has a rank at or over the threshold', () => {
    const tasks = [makeTask({ id: 1, rank: 'a'.repeat(RERANK_RANK_LENGTH_THRESHOLD - 1) })]

    expect(needsRerank(tasks)).toBe(false)
  })

  it('is true when a non-archived task has a rank at the threshold length', () => {
    const tasks = [makeTask({ id: 1, rank: 'a'.repeat(RERANK_RANK_LENGTH_THRESHOLD) })]

    expect(needsRerank(tasks)).toBe(true)
  })

  it('is true when a non-archived task has a rank over the threshold length', () => {
    const tasks = [makeTask({ id: 1, rank: 'a'.repeat(RERANK_RANK_LENGTH_THRESHOLD + 5) })]

    expect(needsRerank(tasks)).toBe(true)
  })

  it('ignores archived tasks with an over-threshold rank', () => {
    const tasks = [makeTask({ id: 1, rank: 'a'.repeat(RERANK_RANK_LENGTH_THRESHOLD + 5), archivedAt: '2026-01-01' })]

    expect(needsRerank(tasks)).toBe(false)
  })

  it('is false for an empty task list', () => {
    expect(needsRerank([])).toBe(false)
  })
})

describe('rerankStatusGroup', () => {
  it('returns an empty array for an empty group', () => {
    expect(rerankStatusGroup([])).toEqual([])
  })

  it('returns an empty array when every task in the group is archived', () => {
    const tasks = [makeTask({ id: 1, rank: '0', archivedAt: '2026-01-01' })]

    expect(rerankStatusGroup(tasks)).toEqual([])
  })

  it('assigns a single, middle rank to a one-task group', () => {
    const tasks = [makeTask({ id: 1, rank: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })]

    expect(rerankStatusGroup(tasks)).toEqual([{ id: 1, rank: LexoRank.middle().toString() }])
  })

  it('preserves the existing relative order of non-archived tasks', () => {
    const tasks = [
      makeTask({ id: 3, rank: 'c'.repeat(35) }),
      makeTask({ id: 1, rank: 'a'.repeat(35) }),
      makeTask({ id: 2, rank: 'b'.repeat(35) }),
    ]

    const result = rerankStatusGroup(tasks)

    expect(result.map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('produces strictly increasing, shorter ranks', () => {
    const tasks = [
      makeTask({ id: 1, rank: 'a'.repeat(35) }),
      makeTask({ id: 2, rank: 'b'.repeat(35) }),
      makeTask({ id: 3, rank: 'c'.repeat(35) }),
    ]

    const result = rerankStatusGroup(tasks)

    expect(result).toHaveLength(3)
    for (const { rank } of result) {
      expect(rank.length).toBeLessThan(RERANK_RANK_LENGTH_THRESHOLD)
    }
    expect(result[0].rank < result[1].rank).toBe(true)
    expect(result[1].rank < result[2].rank).toBe(true)
  })

  it('excludes archived tasks from the reassigned sequence without leaving a gap for them', () => {
    const tasks = [
      makeTask({ id: 1, rank: 'a'.repeat(35) }),
      makeTask({ id: 2, rank: 'b'.repeat(35), archivedAt: '2026-01-01' }),
      makeTask({ id: 3, rank: 'c'.repeat(35) }),
    ]

    const result = rerankStatusGroup(tasks)

    expect(result.map((r) => r.id)).toEqual([1, 3])
    expect(result).toEqual([
      { id: 1, rank: LexoRank.middle().toString() },
      { id: 3, rank: LexoRank.middle().genNext().toString() },
    ])
  })
})
