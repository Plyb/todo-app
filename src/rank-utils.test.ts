import { describe, expect, it } from 'vitest'
import { LexoRank } from 'lexorank'
import { byRank, byStringKey, rankBetween } from './rank-utils'

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
