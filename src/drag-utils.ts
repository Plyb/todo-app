import type { UniqueIdentifier } from '@dnd-kit/abstract'
import { arrayMove } from '@dnd-kit/helpers'
import type { ReactNode } from 'react'

// A single flat list of rows is what dnd-kit actually sorts. Section
// membership is derived from position (each row carries the sectionIndex it
// currently sits under) rather than from separate per-section arrays/contexts
// - this is what lets headers, the FAB's insert-placeholder, and the expanded
// task panel all shift out of the way of a real drag the same way tasks do

type HeaderRow = {
  kind: 'header'
  id: `header:${number}`
  sectionIndex: number
  content: ReactNode
}

type ItemRow<T> = {
  kind: 'item'
  id: number
  sectionIndex: number
  item: T
}

type InsertSlotRow = {
  kind: 'insert-slot'
  id: 'insert-slot'
  sectionIndex: number
  content: ReactNode
}

// Replaces the ItemRow for the expanded item at the same array position -
// it IS that item, just rendered as its panel instead of its normal row.
type ExpandedRow = {
  kind: 'expanded'
  id: number
  sectionIndex: number
  content: ReactNode
}

export const INSERT_BUTTON_ID = 'insert-button' as const

// The FAB, folded into the same flat sortable list as a genuine draggable -
// always the array's last row. Unlike insert-slot/expanded, it DOES
// participate in the normal live-shift strategy (see DraggableList's
// shouldLiveShift) - dragging it toward the top of the list should open a
// gap through the intervening rows exactly like dragging a real task does.
type InsertButtonRow = {
  kind: 'insert-button'
  id: typeof INSERT_BUTTON_ID
}

export type Row<T> = HeaderRow | ItemRow<T> | InsertSlotRow | ExpandedRow | InsertButtonRow

export function buildRows<T extends { id: number }>(
  sections: { header?: ReactNode; items: T[] }[],
  insertSlot?: { sectionIndex: number; index: number; content: ReactNode },
  expandedSlot?: { afterItemId: number; content: ReactNode },
  hasInsertButton?: boolean
): Row<T>[] {
  const rows: Row<T>[] = []

  sections.forEach((section, sectionIndex) => {
    if (section.header) {
      rows.push({ kind: 'header', id: `header:${sectionIndex}`, sectionIndex, content: section.header })
    }

    section.items.forEach((item, i) => {
      if (insertSlot?.sectionIndex === sectionIndex && insertSlot.index === i) {
        rows.push({ kind: 'insert-slot', id: 'insert-slot', sectionIndex, content: insertSlot.content })
      }
      if (expandedSlot?.afterItemId === item.id) {
        rows.push({ kind: 'expanded', id: item.id, sectionIndex, content: expandedSlot.content })
      } else {
        rows.push({ kind: 'item', id: item.id, sectionIndex, item })
      }
    })

    if (insertSlot?.sectionIndex === sectionIndex && insertSlot.index === section.items.length) {
      rows.push({ kind: 'insert-slot', id: 'insert-slot', sectionIndex, content: insertSlot.content })
    }
  })

  if (hasInsertButton) {
    rows.push({ kind: 'insert-button', id: INSERT_BUTTON_ID })
  }

  return rows
}

export function locateRow<T>(rows: Row<T>[], id: UniqueIdentifier): number {
  const index = rows.findIndex((r) => r.id === id)
  if (index === -1) {
    throw new Error(`locateRow: id ${String(id)} not found`)
  }
  return index
}

function insertIndexInSection<T>(rows: Row<T>[], uptoIndex: number, sectionIndex: number): number {
  let count = 0
  for (let i = 0; i < uptoIndex; i++) {
    const row = rows[i]
    if ((row.kind === 'item' || row.kind === 'expanded') && row.sectionIndex === sectionIndex) count++
  }
  return count
}

// Which rows dnd-kit sorts. Items and the insert-button (FAB) are always
// sortable. Headers are sortable too - they need to be drop targets so a drag
// crossing a section boundary registers over them, and they animate/shift as
// items move above them - EXCEPT the very first header, which stays pinned to
// the top of the list and must never move. The insert-slot and expanded panel
// are never sortable (they stay put and only settle via re-render).
//
// The `index` handed to each sortable row's useSortable() is its position
// within THIS subsequence, matching dnd-kit's optimistic-sorting index space.
export function isFirstHeaderIndex<T>(rows: Row<T>[], rowIndex: number): boolean {
  if (rows[rowIndex].kind !== 'header') return false
  return rows.findIndex((r) => r.kind === 'header') === rowIndex
}

export function isSortableRow<T>(rows: Row<T>[], rowIndex: number): boolean {
  const row = rows[rowIndex]
  if (row.kind === 'item' || row.kind === 'insert-button') return true
  if (row.kind === 'header') return !isFirstHeaderIndex(rows, rowIndex)
  return false
}

// The 0-based index dnd-kit should be given for a sortable row - its position
// among only the sortable rows. Non-sortable rows return -1.
export function sortableIndexOf<T>(rows: Row<T>[], rowIndex: number): number {
  let count = 0
  for (let i = 0; i < rowIndex; i++) {
    if (isSortableRow(rows, i)) count++
  }
  return isSortableRow(rows, rowIndex) ? count : -1
}

// Rebuilds the flat row order after the active sortable row has moved from
// `fromSortableIndex` to `toSortableIndex` WITHIN the sortable subsequence,
// while every non-sortable row (first header / insert-slot / expanded) keeps
// its absolute slot. dnd-kit reports drag results purely as indices into the
// sortable subsequence (source.initialIndex -> source.index); this maps that
// back onto the full row model so section membership can be derived exactly
// as before.
function reorderBySortableIndex<T>(
  rows: Row<T>[],
  fromSortableIndex: number,
  toSortableIndex: number
): Row<T>[] {
  const sortable = rows.filter((_, i) => isSortableRow(rows, i))
  const movedSortable = arrayMove(sortable, fromSortableIndex, toSortableIndex)
  let cursor = 0
  return rows.map((row, i) => (isSortableRow(rows, i) ? movedSortable[cursor++] : row))
}

// Headers never move (they're never draggable), so a header row's own
// sectionIndex field is always accurate - unlike an item/expanded row's,
// which goes stale for whichever row was just relocated by arrayMove. So
// section membership at any array position is derived by scanning backward
// for the nearest header, never by reading a (possibly-just-moved) row's own
// field directly.
function sectionIndexAtPosition<T>(rows: Row<T>[], position: number): number {
  for (let i = position - 1; i >= 0; i--) {
    const row = rows[i]
    if (row.kind === 'header') return row.sectionIndex
  }
  return 0
}

// Resolves a drop into a target section + insert index, given the flat row
// array as it was BEFORE the drop plus the active row's final position in
// dnd-kit's sortable index space (from source.index at drag end). The live
// in-drag preview is handled entirely by dnd-kit's own optimistic sorting -
// this only runs once, at drag end, to translate the settled index back into
// the section/insert coordinates the app stores. Returns null for a no-op
// (dropped back where it started).
export function resolveCommit<T extends { id: number }>(
  rows: Row<T>[],
  activeId: UniqueIdentifier,
  toSortableIndex: number
): { toSectionIndex: number; insertIndex: number } | null {
  const activeIndex = locateRow(rows, activeId)
  const fromSortableIndex = sortableIndexOf(rows, activeIndex)
  if (fromSortableIndex === -1) return null
  if (toSortableIndex === fromSortableIndex) return null

  const reordered = reorderBySortableIndex(rows, fromSortableIndex, toSortableIndex)
  const newIndex = reordered.findIndex((r) => r.id === activeId)
  const toSectionIndex = sectionIndexAtPosition(reordered, newIndex)
  const insertIndex = insertIndexInSection(reordered, newIndex, toSectionIndex)

  const fromSectionIndex = sectionIndexAtPosition(rows, activeIndex)
  const fromInsertIndex = insertIndexInSection(rows, activeIndex, fromSectionIndex)
  if (toSectionIndex === fromSectionIndex && insertIndex === fromInsertIndex) return null

  return { toSectionIndex, insertIndex }
}

// Resolves where a brand-new task should be inserted, given the insert
// button's final position in dnd-kit's sortable index space at drop time.
// Deliberately distinct from resolveCommit: the button isn't a real placement
// being diffed against a prior one, so there's no no-op guard - wherever it
// settled is the requested insert point. The button row is itself sortable,
// so we reconstruct the row order with it moved to its settled index, then
// read off the section + insert index at its new slot.
export function resolveInsertTarget<T extends { id: number }>(
  rows: Row<T>[],
  buttonId: UniqueIdentifier,
  toSortableIndex: number
): { sectionIndex: number; insertIndex: number } {
  const buttonIndex = locateRow(rows, buttonId)
  const fromSortableIndex = sortableIndexOf(rows, buttonIndex)
  const reordered =
    fromSortableIndex === -1 ? rows : reorderBySortableIndex(rows, fromSortableIndex, toSortableIndex)
  const newIndex = reordered.findIndex((r) => r.id === buttonId)
  const sectionIndex = sectionIndexAtPosition(reordered, newIndex)
  return { sectionIndex, insertIndex: insertIndexInSection(reordered, newIndex, sectionIndex) }
}
