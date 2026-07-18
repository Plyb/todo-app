import { describe, expect, it } from 'vitest'
import {
  buildRows,
  locateRow,
  resolveCommit,
  resolveInsertTarget,
  resolveEndDrop,
  INSERT_BUTTON_ID,
  type Row,
} from './drag-utils'

type Item = { id: number }

describe('buildRows', () => {
  function sections() {
    return [
      { header: 'A', items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      { header: 'B', items: [{ id: 4 }, { id: 5 }] },
    ]
  }

  it('flattens sections into header + item rows', () => {
    const rows = buildRows(sections())

    expect(rows.map((r) => [r.kind, r.id])).toEqual([
      ['header', 'header:0'],
      ['item', 1],
      ['item', 2],
      ['item', 3],
      ['header', 'header:1'],
      ['item', 4],
      ['item', 5],
    ])
  })

  it('omits the header row when a section has no header', () => {
    const rows = buildRows([{ items: [{ id: 1 }] }])

    expect(rows.map((r) => r.kind)).toEqual(['item'])
  })

  it('splices an insert-slot row at the given index within a section', () => {
    const rows = buildRows(sections(), { sectionIndex: 0, index: 1, content: 'slot' })

    expect(rows.map((r) => [r.kind, r.id])).toEqual([
      ['header', 'header:0'],
      ['item', 1],
      ['insert-slot', 'insert-slot'],
      ['item', 2],
      ['item', 3],
      ['header', 'header:1'],
      ['item', 4],
      ['item', 5],
    ])
  })

  it('places the insert-slot row at the end of a section when index equals its item count', () => {
    const rows = buildRows(sections(), { sectionIndex: 0, index: 3, content: 'slot' })

    expect(rows.map((r) => [r.kind, r.id])).toEqual([
      ['header', 'header:0'],
      ['item', 1],
      ['item', 2],
      ['item', 3],
      ['insert-slot', 'insert-slot'],
      ['header', 'header:1'],
      ['item', 4],
      ['item', 5],
    ])
  })

  it('places a lone insert-slot row in an empty section', () => {
    const rows = buildRows([{ header: 'A', items: [] }], { sectionIndex: 0, index: 0, content: 'slot' })

    expect(rows.map((r) => r.kind)).toEqual(['header', 'insert-slot'])
  })

  it('replaces the matching item with an expanded row at the same position', () => {
    const rows = buildRows(sections(), undefined, { afterItemId: 2, content: 'panel' })

    expect(rows.map((r) => [r.kind, r.id])).toEqual([
      ['header', 'header:0'],
      ['item', 1],
      ['expanded', 2],
      ['item', 3],
      ['header', 'header:1'],
      ['item', 4],
      ['item', 5],
    ])
  })

  it('appends the insert-button as the final row', () => {
    const rows = buildRows(sections(), undefined, undefined, true)

    expect(rows[rows.length - 1]).toEqual({ kind: 'insert-button', id: INSERT_BUTTON_ID })
  })

  it('omits the insert-button row by default', () => {
    const rows = buildRows(sections())

    expect(rows.some((r) => r.kind === 'insert-button')).toBe(false)
  })
})

describe('locateRow', () => {
  it('throws a clear error when the id is not present', () => {
    const rows = buildRows([{ items: [{ id: 1 }] }])
    expect(() => locateRow(rows, 999)).toThrow(/999/)
  })
})

describe('resolveCommit', () => {
  function rows(): Row<Item>[] {
    return [
      { kind: 'header', id: 'header:0', sectionIndex: 0, content: null },
      { kind: 'item', id: 1, item: { id: 1 } },
      { kind: 'item', id: 2, item: { id: 2 } },
      { kind: 'item', id: 3, item: { id: 3 } },
      { kind: 'header', id: 'header:1', sectionIndex: 1, content: null },
      { kind: 'item', id: 4, item: { id: 4 } },
      { kind: 'item', id: 5, item: { id: 5 } },
    ]
  }

  // The third arg is the dragged row's SETTLED position (source.index at drag
  // end): its position in the row array. header:0=0, item1=1, item2=2, item3=3,
  // header:1=4, item4=5, item5=6. A drop in the empty space below the list is a
  // container drop (resolveEndDrop), not a settled sort index handled here.

  it('returns null when the item settled back at its own index', () => {
    expect(resolveCommit(rows(), 1, 1)).toBeNull()
  })

  it('same-section move down: item1 (1) settling at index 3 lands 3rd in section 0', () => {
    expect(resolveCommit(rows(), 1, 3)).toEqual({ toSectionIndex: 0, insertIndex: 2 })
  })

  it('same-section move up: item3 (3) settling at index 1 lands 1st in section 0', () => {
    expect(resolveCommit(rows(), 3, 1)).toEqual({ toSectionIndex: 0, insertIndex: 0 })
  })

  it('cross-section move onto the header slot (index 4) lands at the top of section 1', () => {
    expect(resolveCommit(rows(), 1, 4)).toEqual({ toSectionIndex: 1, insertIndex: 0 })
  })

  it('cross-section move past the header (index 5) lands in section 1 after item4', () => {
    expect(resolveCommit(rows(), 1, 5)).toEqual({ toSectionIndex: 1, insertIndex: 1 })
  })

  it('settling past the last item (index 6) appends to the end of section 1', () => {
    expect(resolveCommit(rows(), 1, 6)).toEqual({ toSectionIndex: 1, insertIndex: 2 })
  })

  it('cross-section move up: item5 (6) settling at index 1 lands at the top of section 0', () => {
    expect(resolveCommit(rows(), 5, 1)).toEqual({ toSectionIndex: 0, insertIndex: 0 })
  })

  // Index 0 is the pinned first header (a disabled sortable that is never a
  // drop target), so the optimistic sorter can never actually settle a drag
  // there - the topmost reachable slot is index 1. Even if index 0 were passed,
  // it resolves harmlessly: for a row already at the top of section 0 it's a
  // no-op, and any other row would land at the top of section 0 (never above
  // the header in the committed model).
  it('drop above the first header (index 0) is unreachable/no-op for the top row', () => {
    expect(resolveCommit(rows(), 1, 0)).toBeNull()
  })

  it('drop above the first header (index 0) still attributes to the top of section 0', () => {
    expect(resolveCommit(rows(), 5, 0)).toEqual({ toSectionIndex: 0, insertIndex: 0 })
  })

  it('resolves to section 0 for a list with no header rows at all', () => {
    const flat: Row<Item>[] = [
      { kind: 'item', id: 1, item: { id: 1 } },
      { kind: 'item', id: 2, item: { id: 2 } },
      { kind: 'item', id: 3, item: { id: 3 } },
    ]

    expect(resolveCommit(flat, 1, 2)).toEqual({ toSectionIndex: 0, insertIndex: 2 })
  })

  it('headerless first section: item from section 1 lands positionally in section 0', () => {
    const mixed: Row<Item>[] = [
      { kind: 'item', id: 1, item: { id: 1 } },
      { kind: 'item', id: 2, item: { id: 2 } },
      { kind: 'header', id: 'header:1', sectionIndex: 1, content: null },
      { kind: 'item', id: 3, item: { id: 3 } },
    ]

    expect(resolveCommit(mixed, 3, 1)).toEqual({ toSectionIndex: 0, insertIndex: 1 })
  })

  describe('with insert-slot and expanded rows present', () => {
    // Both the insert-slot and the expanded panel are drop targets (droppable)
    // that occupy a position and can be settled onto. They differ in the insert
    // count: the insert-slot is an inert placeholder, never counted; the
    // expanded panel represents the item it expands, which still occupies that
    // logical slot, so it IS counted as an item. Positions: header:0=0,
    // item1=1, insert-slot=2, item2=3, expanded(id 3)=4, item4=5.
    function rows(): Row<Item>[] {
      return [
        { kind: 'header', id: 'header:0', sectionIndex: 0, content: null },
        { kind: 'item', id: 1, item: { id: 1 } },
        { kind: 'insert-slot', id: 'insert-slot', content: null },
        { kind: 'item', id: 2, item: { id: 2 } },
        { kind: 'expanded', id: 3, content: null },
        { kind: 'item', id: 4, item: { id: 4 } },
      ]
    }

    it('moving item4 up to just before item2 skips the insert-slot in the count', () => {
      expect(resolveCommit(rows(), 4, 3)).toEqual({ toSectionIndex: 0, insertIndex: 1 })
    })

    it('moving item1 down past the expanded row counts it as an item', () => {
      expect(resolveCommit(rows(), 1, 5)).toEqual({ toSectionIndex: 0, insertIndex: 3 })
    })

    it('dropping directly onto the insert-slot lands at that slot position', () => {
      // item4 (5) settling onto the insert-slot (2), which sits between item1
      // and item2 - so it lands after item1, at insert index 1.
      expect(resolveCommit(rows(), 4, 2)).toEqual({ toSectionIndex: 0, insertIndex: 1 })
    })

    it('dropping directly onto the expanded row lands right after that item', () => {
      // item1 (1) settling onto the expanded panel (4) for item3 - the settled
      // slot is where the expanded item sits, so item1 lands after item2 and
      // item3, at insert index 2.
      expect(resolveCommit(rows(), 1, 4)).toEqual({ toSectionIndex: 0, insertIndex: 2 })
    })
  })
})

describe('resolveInsertTarget', () => {
  // Mirrors real buildRows output: the FAB is the final row.
  function rows(): Row<Item>[] {
    return [
      { kind: 'header', id: 'header:0', sectionIndex: 0, content: null },
      { kind: 'item', id: 1, item: { id: 1 } },
      { kind: 'item', id: 2, item: { id: 2 } },
      { kind: 'header', id: 'header:1', sectionIndex: 1, content: null },
      { kind: 'item', id: 3, item: { id: 3 } },
      { kind: 'insert-button', id: INSERT_BUTTON_ID },
    ]
  }

  // The FAB is itself a sortable row keyed by its position; the second arg is
  // where it settled: header:0=0, item1=1, item2=2, header:1=3, item3=4, FAB=5.

  it('settling between the first two items inserts after the first, in section 0', () => {
    expect(resolveInsertTarget(rows(), 2)).toEqual({ sectionIndex: 0, insertIndex: 1 })
  })

  it('settling just after the header (index 4) inserts at the top of section 1', () => {
    expect(resolveInsertTarget(rows(), 4)).toEqual({ sectionIndex: 1, insertIndex: 0 })
  })

  it('settling at its own resting slot (index 5) appends to the end of section 1', () => {
    expect(resolveInsertTarget(rows(), 5)).toEqual({ sectionIndex: 1, insertIndex: 1 })
  })

  it('settling at the very top (index 1) inserts at the top of section 0', () => {
    expect(resolveInsertTarget(rows(), 1)).toEqual({ sectionIndex: 0, insertIndex: 0 })
  })

  it('settling into an empty first section inserts at its start', () => {
    // Section 0 is empty (header:0 with no items). Positions: header:0=0,
    // header:1=1, item1=2, FAB=3. Dropping the FAB just below header:0 (index 1)
    // resolves to the empty section 0, insert index 0.
    const emptyFirst: Row<Item>[] = [
      { kind: 'header', id: 'header:0', sectionIndex: 0, content: null },
      { kind: 'header', id: 'header:1', sectionIndex: 1, content: null },
      { kind: 'item', id: 1, item: { id: 1 } },
      { kind: 'insert-button', id: INSERT_BUTTON_ID },
    ]

    expect(resolveInsertTarget(emptyFirst, 1)).toEqual({ sectionIndex: 0, insertIndex: 0 })
  })

  it('resolves to section 0 for a list with no header rows at all', () => {
    const flat: Row<Item>[] = [
      { kind: 'item', id: 1, item: { id: 1 } },
      { kind: 'item', id: 2, item: { id: 2 } },
      { kind: 'insert-button', id: INSERT_BUTTON_ID },
    ]

    expect(resolveInsertTarget(flat, 1)).toEqual({ sectionIndex: 0, insertIndex: 1 })
  })
})

describe('resolveEndDrop', () => {
  function rows(): Row<Item>[] {
    return [
      { kind: 'header', id: 'header:0', sectionIndex: 0, content: null },
      { kind: 'item', id: 1, item: { id: 1 } },
      { kind: 'item', id: 2, item: { id: 2 } },
      { kind: 'item', id: 3, item: { id: 3 } },
      { kind: 'header', id: 'header:1', sectionIndex: 1, content: null },
      { kind: 'item', id: 4, item: { id: 4 } },
      { kind: 'item', id: 5, item: { id: 5 } },
    ]
  }

  it('appends to the end of the last section (FAB / new task, nothing excluded)', () => {
    expect(resolveEndDrop(rows())).toEqual({ sectionIndex: 1, insertIndex: 2 })
  })

  it('excludes the active item when it already lives in the last section', () => {
    // Dragging item5 (2nd of section 1) to the end: it must not count itself,
    // so it lands after item4 at index 1, not 2.
    expect(resolveEndDrop(rows(), 5)).toEqual({ sectionIndex: 1, insertIndex: 1 })
  })

  it('counts the full last section when the active item comes from another section', () => {
    expect(resolveEndDrop(rows(), 1)).toEqual({ sectionIndex: 1, insertIndex: 2 })
  })

  it('resolves to section 0, index 0 when there are no sections at all', () => {
    expect(resolveEndDrop([])).toEqual({ sectionIndex: 0, insertIndex: 0 })
  })

  it('resolves to section 0 for a headerless flat list', () => {
    const flat: Row<Item>[] = [
      { kind: 'item', id: 1, item: { id: 1 } },
      { kind: 'item', id: 2, item: { id: 2 } },
    ]

    expect(resolveEndDrop(flat)).toEqual({ sectionIndex: 0, insertIndex: 2 })
  })
})
