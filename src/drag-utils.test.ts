import { describe, expect, it } from 'vitest'
import { buildRows, locateRow, resolveCommit, resolveInsertTarget, INSERT_BUTTON_ID, type Row } from './drag-utils'

type Item = { id: number }

describe('buildRows', () => {
  function sections() {
    return [
      { header: 'A', items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      { header: 'B', items: [{ id: 4 }, { id: 5 }] },
    ]
  }

  it('flattens sections into header + item rows in order', () => {
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

  it('appends one insert-button row as the array\'s last row when requested', () => {
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
      { kind: 'item', id: 1, sectionIndex: 0, item: { id: 1 } },
      { kind: 'item', id: 2, sectionIndex: 0, item: { id: 2 } },
      { kind: 'item', id: 3, sectionIndex: 0, item: { id: 3 } },
      { kind: 'header', id: 'header:1', sectionIndex: 1, content: null },
      { kind: 'item', id: 4, sectionIndex: 1, item: { id: 4 } },
      { kind: 'item', id: 5, sectionIndex: 1, item: { id: 5 } },
    ]
  }

  // The third arg is the dragged row's SETTLED position in dnd-kit's sortable
  // index space (source.index at drag end), i.e. its index among the sortable
  // rows. That space includes non-first headers (they're drop targets) but
  // NOT the first header (pinned). For rows() it is: item1=0, item2=1,
  // item3=2, header:1=3, item4=4, item5=5.

  it('returns null when the item settled back at its own sortable index', () => {
    expect(resolveCommit(rows(), 1, 0)).toBeNull()
  })

  it('same-section move down: item1 (0) settling at index 2 lands 3rd in section 0', () => {
    expect(resolveCommit(rows(), 1, 2)).toEqual({ toSectionIndex: 0, insertIndex: 2 })
  })

  it('same-section move up: item3 (2) settling at index 0 lands 1st in section 0', () => {
    expect(resolveCommit(rows(), 3, 0)).toEqual({ toSectionIndex: 0, insertIndex: 0 })
  })

  it('cross-section move onto the header slot (3) lands at the top of section 1', () => {
    expect(resolveCommit(rows(), 1, 3)).toEqual({ toSectionIndex: 1, insertIndex: 0 })
  })

  it('cross-section move past the header (index 4) lands in section 1 after item4', () => {
    expect(resolveCommit(rows(), 1, 4)).toEqual({ toSectionIndex: 1, insertIndex: 1 })
  })

  it('cross-section move up: item5 (5) settling at index 0 lands at the top of section 0', () => {
    expect(resolveCommit(rows(), 5, 0)).toEqual({ toSectionIndex: 0, insertIndex: 0 })
  })

  it('resolves to section 0 for a list with no header rows at all', () => {
    const flat: Row<Item>[] = [
      { kind: 'item', id: 1, sectionIndex: 0, item: { id: 1 } },
      { kind: 'item', id: 2, sectionIndex: 0, item: { id: 2 } },
      { kind: 'item', id: 3, sectionIndex: 0, item: { id: 3 } },
    ]

    expect(resolveCommit(flat, 1, 2)).toEqual({ toSectionIndex: 0, insertIndex: 2 })
  })
})

describe('resolveInsertTarget', () => {
  function rows(): Row<Item>[] {
    return [
      { kind: 'header', id: 'header:0', sectionIndex: 0, content: null },
      { kind: 'item', id: 1, sectionIndex: 0, item: { id: 1 } },
      { kind: 'item', id: 2, sectionIndex: 0, item: { id: 2 } },
      { kind: 'header', id: 'header:1', sectionIndex: 1, content: null },
      { kind: 'item', id: 3, sectionIndex: 1, item: { id: 3 } },
      { kind: 'insert-button', id: INSERT_BUTTON_ID },
    ]
  }

  // The FAB is itself a sortable row; the second arg is where it settled in
  // dnd-kit's sortable index space, which includes the non-first header. For
  // rows() that space is: item1=0, item2=1, header:1=2, item3=3, FAB=4.

  it('settling between the first two items inserts after the first, in section 0', () => {
    expect(resolveInsertTarget(rows(), INSERT_BUTTON_ID, 1)).toEqual({ sectionIndex: 0, insertIndex: 1 })
  })

  it('settling just past the header (index 3) inserts at the top of section 1', () => {
    expect(resolveInsertTarget(rows(), INSERT_BUTTON_ID, 3)).toEqual({ sectionIndex: 1, insertIndex: 0 })
  })

  it('settling at the very top inserts at the top of section 0', () => {
    expect(resolveInsertTarget(rows(), INSERT_BUTTON_ID, 0)).toEqual({ sectionIndex: 0, insertIndex: 0 })
  })

  it('resolves to section 0 for a list with no header rows at all', () => {
    const flat: Row<Item>[] = [
      { kind: 'item', id: 1, sectionIndex: 0, item: { id: 1 } },
      { kind: 'item', id: 2, sectionIndex: 0, item: { id: 2 } },
      { kind: 'insert-button', id: INSERT_BUTTON_ID },
    ]

    expect(resolveInsertTarget(flat, INSERT_BUTTON_ID, 1)).toEqual({ sectionIndex: 0, insertIndex: 1 })
  })
})
