import { describe, expect, it } from 'vitest'
import { buildRows, locateRow, resolveCommit, type Row } from './drag-utils'

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

  it('returns null when hovering the dragged item itself', () => {
    expect(resolveCommit(rows(), 1, 1)).toBeNull()
  })

  it('same-section drag down: lands after the hovered item', () => {
    expect(resolveCommit(rows(), 1, 3)).toEqual({ toSectionIndex: 0, insertIndex: 2 })
  })

  it('same-section drag up: lands before the hovered item', () => {
    expect(resolveCommit(rows(), 3, 1)).toEqual({ toSectionIndex: 0, insertIndex: 0 })
  })

  it('cross-section drag down: lands at the hovered item, in its (new) section', () => {
    expect(resolveCommit(rows(), 1, 4)).toEqual({ toSectionIndex: 1, insertIndex: 1 })
  })

  it('hovering a header from above: lands at the top of that section', () => {
    expect(resolveCommit(rows(), 1, 'header:1')).toEqual({ toSectionIndex: 1, insertIndex: 0 })
  })

  it('hovering a header from below: lands at the top of that section (not the previous one)', () => {
    expect(resolveCommit(rows(), 5, 'header:0')).toEqual({ toSectionIndex: 0, insertIndex: 0 })
  })

  it('returns null when hovering your own section header while already first in it', () => {
    expect(resolveCommit(rows(), 1, 'header:0')).toBeNull()
  })

  it('resolves to section 0 for a list with no header rows at all', () => {
    const flat: Row<Item>[] = [
      { kind: 'item', id: 1, sectionIndex: 0, item: { id: 1 } },
      { kind: 'item', id: 2, sectionIndex: 0, item: { id: 2 } },
      { kind: 'item', id: 3, sectionIndex: 0, item: { id: 3 } },
    ]

    expect(resolveCommit(flat, 1, 3)).toEqual({ toSectionIndex: 0, insertIndex: 2 })
  })
})
