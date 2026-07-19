import type { UniqueIdentifier } from '@dnd-kit/abstract'
import type { ReactNode } from 'react'

// A single flat list of rows is what dnd-kit actually sorts, using each row's
// position in the list as its sort index. Section membership is derived from
// position by scanning back to the nearest header (only headers carry a
// sectionIndex), rather than from separate per-section arrays/contexts - this
// is what lets headers, the FAB's insert-placeholder, and the expanded task
// panel all shift out of the way of a real drag the same way tasks do.

type HeaderRow = {
  kind: 'header'
  id: `header:${number}`
  sectionIndex: number
  content: ReactNode
}

// A section's lazy-loading footer (spinner or scroll sentinel, see
// LoadMoreSentinel) - non-draggable and excluded from item-index math exactly
// like a header, just anchored to the end of its section instead of the start.
type SectionFooterRow = {
  kind: 'section-footer'
  id: `footer:${number}`
  content: ReactNode
}

type ItemRow<T> = {
  kind: 'item'
  id: number
  item: T
}

type InsertSlotRow = {
  kind: 'insert-slot'
  id: 'insert-slot'
  content: ReactNode
}

// Replaces the ItemRow for the expanded item at the same array position -
// it IS that item, just rendered as its panel instead of its normal row.
type ExpandedRow = {
  kind: 'expanded'
  id: number
  content: ReactNode
}

export const INSERT_BUTTON_ID = 'insert-button' as const

// The wrapping <ul>, registered as a plain droppable so a drag released in the
// empty space below the last row resolves to the end of the list.
export const LIST_DROPPABLE_ID = 'list-container' as const

// The FAB is folded into the same flat sortable list as a genuine draggable -
// always the array's last row, occupying a real position and participating
// in sorting like any other row. Easy to miss since it's a button, not a
// task: dragging it toward the top of the list opens a gap through the
// intervening rows exactly like dragging a real task does.
type InsertButtonRow = {
  kind: 'insert-button'
  id: typeof INSERT_BUTTON_ID
}

export type Row<T> =
  | HeaderRow
  | ItemRow<T>
  | InsertSlotRow
  | ExpandedRow
  | InsertButtonRow
  | SectionFooterRow

function* generateRows<T extends { id: number }>(
  sections: { header?: ReactNode; items: T[]; footer?: ReactNode }[],
  insertSlot?: { sectionIndex: number; index: number; content: ReactNode },
  expandedSlot?: { afterItemId: number; content: ReactNode },
  hasInsertButton?: boolean
): Generator<Row<T>> {
  for (const [sectionIndex, section] of sections.entries()) {
    if (section.header) {
      yield { kind: 'header', id: `header:${sectionIndex}`, sectionIndex, content: section.header }
    }

    for (const [i, item] of section.items.entries()) {
      if (insertSlot?.sectionIndex === sectionIndex && insertSlot.index === i) {
        yield { kind: 'insert-slot', id: 'insert-slot', content: insertSlot.content }
      }
      if (expandedSlot?.afterItemId === item.id) {
        yield { kind: 'expanded', id: item.id, content: expandedSlot.content }
      } else {
        yield { kind: 'item', id: item.id, item }
      }
    }

    if (insertSlot?.sectionIndex === sectionIndex && insertSlot.index === section.items.length) {
      yield { kind: 'insert-slot', id: 'insert-slot', content: insertSlot.content }
    }

    if (section.footer) {
      yield { kind: 'section-footer', id: `footer:${sectionIndex}`, content: section.footer }
    }
  }

  if (hasInsertButton) {
    yield { kind: 'insert-button', id: INSERT_BUTTON_ID }
  }
}

export function buildRows<T extends { id: number }>(
  sections: { header?: ReactNode; items: T[]; footer?: ReactNode }[],
  insertSlot?: { sectionIndex: number; index: number; content: ReactNode },
  expandedSlot?: { afterItemId: number; content: ReactNode },
  hasInsertButton?: boolean
): Row<T>[] {
  return [...generateRows(sections, insertSlot, expandedSlot, hasInsertButton)]
}

export function locateRow<T>(rows: Row<T>[], id: UniqueIdentifier): number {
  const index = rows.findIndex((r) => r.id === id)
  if (index === -1) {
    throw new Error(`locateRow: id ${String(id)} not found`)
  }
  return index
}

function countItemsInSection<T>(
  rows: Row<T>[],
  sectionIndex: number,
  uptoIndex: number,
  excludeId?: UniqueIdentifier
): number {
  let count = 0
  let currentSection = 0
  for (let i = 0; i < uptoIndex; i++) {
    const row = rows[i]
    if (row.kind === 'header') {
      currentSection = row.sectionIndex
      continue
    }
    if ((row.kind === 'item' || row.kind === 'expanded') && currentSection === sectionIndex && row.id !== excludeId) {
      count++
    }
  }
  return count
}

// Only headers carry a sectionIndex, so section membership at any array
// position is derived by scanning backward for the nearest header rather than
// reading a row's own field.
function sectionIndexAtPosition<T>(rows: Row<T>[], position: number): number {
  for (let i = position - 1; i >= 0; i--) {
    const row = rows[i]
    if (row.kind === 'header') return row.sectionIndex
  }
  return 0
}

// Landing slot = min(toIndex, last), matching arrayMove's splice-append clamp.
// arrayMove lands an up-move before that slot and a down-move after it, so a
// down-move reads one row further and excludes the moved row from the count (it
// still sits in the pre-drop prefix being scanned). This reads the section +
// insert index straight off the pre-drop array, with no reordered copy.
function resolveTarget<T>(
  rows: Row<T>[],
  fromIndex: number,
  toIndex: number
): { sectionIndex: number; insertIndex: number } {
  const landing = Math.min(toIndex, rows.length - 1)
  const boundary = landing > fromIndex ? landing + 1 : landing
  const sectionIndex = sectionIndexAtPosition(rows, boundary)
  const insertIndex = countItemsInSection(rows, sectionIndex, boundary, rows[fromIndex].id)
  return { sectionIndex, insertIndex }
}

// Runs once, at drag end, to translate the row's settled index back into
// section/insert coordinates, reading off the pre-drop row array. Returns
// null for a no-op (dropped back where it started).
export function resolveCommit<T extends { id: number }>(
  rows: Row<T>[],
  activeId: UniqueIdentifier,
  toIndex: number
): { toSectionIndex: number; insertIndex: number } | null {
  const fromIndex = locateRow(rows, activeId)
  if (toIndex === fromIndex) return null

  const { sectionIndex: toSectionIndex, insertIndex } = resolveTarget(rows, fromIndex, toIndex)

  const fromSectionIndex = sectionIndexAtPosition(rows, fromIndex)
  const fromInsertIndex = countItemsInSection(rows, fromSectionIndex, fromIndex)
  if (toSectionIndex === fromSectionIndex && insertIndex === fromInsertIndex) return null

  return { toSectionIndex, insertIndex }
}

// Resolves where a brand-new task should be inserted, given the insert
// button's final position at drop time. Deliberately distinct from
// resolveCommit: the button isn't a real placement being diffed against a
// prior one, so there's no no-op guard - wherever it settled is the requested
// insert point.
export function resolveInsertTarget<T extends { id: number }>(
  rows: Row<T>[],
  toIndex: number
): { sectionIndex: number; insertIndex: number } {
  return resolveTarget(rows, locateRow(rows, INSERT_BUTTON_ID), toIndex)
}

// Resolves a drop onto the list container: the end of the last section. The
// container is a plain droppable matched by its target id, not a settled sort
// index. `activeId` (an existing item) is excluded so a within-last-section
// drop to the end reports the correct index.
export function resolveEndDrop<T extends { id: number }>(
  rows: Row<T>[],
  activeId?: UniqueIdentifier
): { sectionIndex: number; insertIndex: number } {
  const sectionIndex = rows.reduce((max, row) => (row.kind === 'header' ? Math.max(max, row.sectionIndex) : max), 0)
  return { sectionIndex, insertIndex: countItemsInSection(rows, sectionIndex, rows.length, activeId) }
}
