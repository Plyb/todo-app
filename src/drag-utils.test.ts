import { describe, expect, it } from 'vitest'
import {
  collisionDetection,
  isBelowMidpoint,
  locateItem,
  moveItemToSection,
  resolveCommit,
  resolveDrop,
  resolveReorder,
  toSectionDropId,
} from './drag-utils'

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

describe('locateItem', () => {
  it('throws a clear error when the id is not present in any section', () => {
    expect(() => locateItem(sectionsFixture(), 999)).toThrow(/999/)
  })
})

describe('resolveReorder', () => {
  it('same-section drag down: inserts after the over item', () => {
    const result = resolveReorder(sectionsFixture(), 1, 3)

    expect(result).toEqual({ toSectionIndex: 0, insertIndex: 2, fromSectionIndex: 0 })
  })

  it('same-section drag up: inserts before the over item', () => {
    const result = resolveReorder(sectionsFixture(), 3, 1)

    expect(result).toEqual({ toSectionIndex: 0, insertIndex: 0, fromSectionIndex: 0 })
  })

  it('cross-section drag: inserts before the over item by default', () => {
    const result = resolveReorder(sectionsFixture(), 1, 5)

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 1, fromSectionIndex: 0 })
  })

  it('cross-section drag: inserts after the over item when insertAfter is true', () => {
    const result = resolveReorder(sectionsFixture(), 1, 5, true)

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 2, fromSectionIndex: 0 })
  })

  it('ignores insertAfter for a same-section drag (direction already comes from oldIndex vs overIndex)', () => {
    const withInsertAfter = resolveReorder(sectionsFixture(), 1, 3, true)
    const withoutInsertAfter = resolveReorder(sectionsFixture(), 1, 3, false)

    expect(withInsertAfter).toEqual(withoutInsertAfter)
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

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 1, fromSectionIndex: 0 })
  })

  it('passes insertAfter through to resolveReorder for a real item id', () => {
    const result = resolveDrop(sectionsFixture(), 1, 5, true)

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 2, fromSectionIndex: 0 })
  })

  it('returns null when hovering the dragged item itself', () => {
    const result = resolveDrop(sectionsFixture(), 1, 1)

    expect(result).toBeNull()
  })

  it('resolves a section-container id to the end of an empty section', () => {
    const result = resolveDrop(sectionsFixtureWithEmpty(), 1, toSectionDropId(1))

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 0, fromSectionIndex: 0 })
  })

  it('resolves a section-container id to the end of a populated section', () => {
    const result = resolveDrop(sectionsFixture(), 1, toSectionDropId(1))

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 2, fromSectionIndex: 0 })
  })
})

describe('resolveCommit', () => {
  it('returns null when there is no target', () => {
    expect(resolveCommit(sectionsFixture(), 1, null)).toBeNull()
  })

  it('returns null when the target is the same position the drag started from', () => {
    const result = resolveCommit(sectionsFixture(), 1, { toSectionIndex: 0, insertIndex: 0 })

    expect(result).toBeNull()
  })

  it('returns the target when it differs from the starting position', () => {
    const result = resolveCommit(sectionsFixture(), 1, { toSectionIndex: 1, insertIndex: 1 })

    expect(result).toEqual({ toSectionIndex: 1, insertIndex: 1 })
  })
})

describe('collisionDetection', () => {
  function rect(top: number, left: number, width: number, height: number) {
    return { top, left, width, height, right: left + width, bottom: top + height }
  }

  function droppable(id: string | number, r: ReturnType<typeof rect>) {
    return { id, rect: r }
  }

  it('prefers a droppable the pointer is literally inside over a larger enclosing one', () => {
    // A small item rect nested inside a much larger section-container rect,
    // both containing the pointer coordinate - closestCenter would pick
    // whichever's CENTER is nearest, which can favor the large container;
    // pointerWithin should favor the tightly-fitting item instead.
    const item = droppable('item-1', rect(100, 0, 200, 40))
    const section = droppable('section-drop-0', rect(0, 0, 200, 400))
    const droppableContainers = [item, section]
    const droppableRects = new Map(droppableContainers.map((d) => [d.id, d.rect]))

    const result = collisionDetection({
      active: { id: 'item-1' },
      collisionRect: rect(105, 0, 200, 40),
      droppableRects,
      droppableContainers,
      pointerCoordinates: { x: 100, y: 120 },
    } as never)

    expect(result[0]?.id).toBe('item-1')
  })

  it('falls back to the enclosing container when the pointer is over empty section space', () => {
    const item = droppable('item-1', rect(0, 0, 200, 40))
    const section = droppable('section-drop-0', rect(0, 0, 200, 400))
    const droppableContainers = [item, section]
    const droppableRects = new Map(droppableContainers.map((d) => [d.id, d.rect]))

    const result = collisionDetection({
      active: { id: 'dragged' },
      collisionRect: rect(300, 0, 200, 40),
      droppableRects,
      droppableContainers,
      pointerCoordinates: { x: 100, y: 320 },
    } as never)

    expect(result[0]?.id).toBe('section-drop-0')
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
