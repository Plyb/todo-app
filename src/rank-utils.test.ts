import { describe, expect, it } from 'vitest'
import { LexoRank } from 'lexorank'
import { byRank, byStringKey, rankBetween, rankAtInsertIndex } from './rank-utils'
import type { Task } from './types'

describe('rankBetween', () => {
  it('returns a rank strictly between prev and next when both are given', () => {
    const prev = { rank: LexoRank.middle().toString() }
    const next = { rank: LexoRank.middle().genNext().toString() }

    const result = rankBetween(prev, next)

    expect(result > prev.rank).toBe(true)
    expect(result < next.rank).toBe(true)
  })

  it('returns a rank after prev when only prev is given', () => {
    const prev = { rank: LexoRank.middle().toString() }

    const result = rankBetween(prev, null)

    expect(result > prev.rank).toBe(true)
  })

  it('returns a rank before next when only next is given', () => {
    const next = { rank: LexoRank.middle().toString() }

    const result = rankBetween(null, next)

    expect(result < next.rank).toBe(true)
  })

  it('returns the middle rank when neither prev nor next is given', () => {
    const result = rankBetween(null, null)

    expect(result).toBe(LexoRank.middle().toString())
  })
})

describe('byStringKey', () => {
  it('sorts ascending by the given key', () => {
    const items = [{ label: 'b' }, { label: 'a' }, { label: 'c' }]

    expect(items.sort(byStringKey('label'))).toEqual([{ label: 'a' }, { label: 'b' }, { label: 'c' }])
  })

  it('returns 0 for equal keys (a tie)', () => {
    const compare = byStringKey('label')

    expect(compare({ label: 'same' }, { label: 'same' })).toBe(0)
  })
})

describe('byRank', () => {
  it('sorts ascending by rank', () => {
    const low = { rank: LexoRank.middle().toString() }
    const high = { rank: LexoRank.middle().genNext().toString() }

    expect([high, low].sort(byRank)).toEqual([low, high])
  })

  it('returns 0 for equal ranks (a tie)', () => {
    const rank = LexoRank.middle().toString()

    expect(byRank({ rank }, { rank })).toBe(0)
  })
})

describe('rankAtInsertIndex', () => {
  const makeTask = (id: number, rank: string): Task => ({
    id,
    name: `Task ${id}`,
    rank,
    completedAt: null,
    archivedAt: null,
    statusSlug: 'backlog',
    notes: '',
    sourceId: 'indexeddb',
  })

  const tasks = [
    makeTask(1, LexoRank.middle().toString()),
    makeTask(2, LexoRank.middle().genNext().toString()),
    makeTask(3, LexoRank.middle().genNext().genNext().toString()),
  ]

  it('returns a rank before the first task when insertIndex is 0', () => {
    const result = rankAtInsertIndex(tasks, 0)

    expect(result < tasks[0].rank).toBe(true)
  })

  it('returns a rank between two tasks when insertIndex is in the middle', () => {
    const result = rankAtInsertIndex(tasks, 1)

    expect(result > tasks[0].rank).toBe(true)
    expect(result < tasks[1].rank).toBe(true)
  })

  it('returns a rank after the last task when insertIndex equals tasks.length', () => {
    const result = rankAtInsertIndex(tasks, tasks.length)

    expect(result > tasks[tasks.length - 1].rank).toBe(true)
  })

  it('returns a middle rank when tasks array is empty', () => {
    const result = rankAtInsertIndex([], 0)

    expect(result).toBe(LexoRank.middle().toString())
  })

  it('excludes the specified task when computing neighbors', () => {
    const result = rankAtInsertIndex(tasks, 1, 1)

    expect(result > tasks[0].rank).toBe(true)
    expect(result < tasks[2].rank).toBe(true)
  })

  it('produces the same rank as an equivalent rankBetween call with the same neighbors', () => {
    const result = rankAtInsertIndex(tasks, 2)
    const equivalentBetween = rankBetween(tasks[1], tasks[2])

    expect(result).toBe(equivalentBetween)
  })
})
