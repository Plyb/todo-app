import { describe, expect, it } from 'vitest'
import { resolveReorder } from './drag-utils'

function sectionsFixture() {
  return [
    { items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    { items: [{ id: 4 }, { id: 5 }] },
  ]
}

describe('resolveReorder', () => {
  it('same-section drag down: inserts after the over item', () => {
    const result = resolveReorder(sectionsFixture(), 1, 3)

    expect(result).toEqual({ toSectionIndex: 0, insertIndex: 2 })
  })

  it('same-section drag up: inserts before the over item', () => {
    const result = resolveReorder(sectionsFixture(), 3, 1)

    expect(result).toEqual({ toSectionIndex: 0, insertIndex: 0 })
  })

  it('cross-section drag: inserts at the over item index in the target section', () => {
    const result = resolveReorder(sectionsFixture(), 1, 5)

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 1 })
  })
})
