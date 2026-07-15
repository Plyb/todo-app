import { describe, expect, it } from 'vitest'
import { isBelowMidpoint, moveItemToSection, resolveDrop, resolveReorder, toSectionDropId } from './drag-utils'

function sectionsFixture() {
  return [
    { items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    { items: [{ id: 4 }, { id: 5 }] },
  ]
}

function sectionsFixtureWithEmpty() {
  return [
    { items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    { items: [] as { id: number }[] },
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

  it('cross-section drag: inserts before the over item by default', () => {
    const result = resolveReorder(sectionsFixture(), 1, 5)

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 1 })
  })

  it('cross-section drag: inserts after the over item when insertAfter is true', () => {
    const result = resolveReorder(sectionsFixture(), 1, 5, true)

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 2 })
  })
})

describe('isBelowMidpoint', () => {
  it('is false when there is no active rect yet', () => {
    expect(isBelowMidpoint(null, { top: 0, height: 40 })).toBe(false)
  })

  it('is false when the active item center sits above the over item center', () => {
    expect(isBelowMidpoint({ top: 0, height: 40 }, { top: 100, height: 40 })).toBe(false)
  })

  it('is true when the active item center sits below the over item center', () => {
    expect(isBelowMidpoint({ top: 200, height: 40 }, { top: 100, height: 40 })).toBe(true)
  })
})

describe('resolveDrop', () => {
  it('delegates to resolveReorder when overId is a real item id', () => {
    const result = resolveDrop(sectionsFixture(), 1, 5)

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 1 })
  })

  it('returns null when hovering the dragged item itself', () => {
    const result = resolveDrop(sectionsFixture(), 1, 1)

    expect(result).toBeNull()
  })

  it('resolves a section-container id to the end of an empty section', () => {
    const result = resolveDrop(sectionsFixtureWithEmpty(), 1, toSectionDropId(1))

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 0 })
  })

  it('resolves a section-container id to the end of a populated section', () => {
    const result = resolveDrop(sectionsFixture(), 1, toSectionDropId(1))

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 2 })
  })
})

describe('moveItemToSection', () => {
  it('relocates the active item into an empty target section', () => {
    const result = moveItemToSection(sectionsFixtureWithEmpty(), 1, 1, 0)

    expect(result).toEqual([
      { items: [{ id: 2 }, { id: 3 }] },
      { items: [{ id: 1 }] },
    ])
  })

  it('relocates the active item into a populated target section at the given index', () => {
    const result = moveItemToSection(sectionsFixture(), 1, 1, 1)

    expect(result).toEqual([
      { items: [{ id: 2 }, { id: 3 }] },
      { items: [{ id: 4 }, { id: 1 }, { id: 5 }] },
    ])
  })

  it('repositions within the same section', () => {
    const result = moveItemToSection(sectionsFixture(), 1, 0, 2)

    expect(result).toEqual([
      { items: [{ id: 2 }, { id: 3 }, { id: 1 }] },
      { items: [{ id: 4 }, { id: 5 }] },
    ])
  })
})
