import type { UniqueIdentifier } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { ReactNode } from 'react'

// A single flat list of rows is what dnd-kit actually sorts. Section
// membership is derived from position (each row carries the sectionIndex it
// currently sits under) rather than from separate per-section arrays/contexts
// - this is what lets headers, the FAB's insert-placeholder, and the expanded
// task panel all shift out of the way of a real drag the same way tasks do,
// using dnd-kit's own index-based animation machinery instead of hand-rolled
// FLIP code.

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
// array as it was BEFORE the drop (the live in-drag preview is handled
// entirely by dnd-kit's own shift animation - this only runs once, at
// handleDragEnd). Hovering a header means "top of that section", not
// "end of the previous one" - the one deliberate special case, since a
// header is the only non-task row still eligible to be `over` (insert-slot
// and expanded rows are fully droppable-disabled).
export function resolveCommit<T extends { id: number }>(
  rows: Row<T>[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier
): { toSectionIndex: number; insertIndex: number } | null {
  if (activeId === overId) return null

  const activeIndex = locateRow(rows, activeId)
  const overIndex = locateRow(rows, overId)
  // arrayMove(rows, activeIndex, overIndex) already lands the active row
  // exactly at the header's own slot (pushing the header and everything
  // after it forward by one) when arriving from ABOVE the header - which
  // already means "right after the header". Arriving from BELOW needs a +1
  // nudge, or the active row lands just before the header (into the
  // previous section) instead of after it. Plain item targets need no such
  // adjustment in either direction - this is a header-only asymmetry of
  // splice-based array moves.
  const targetIndex = rows[overIndex].kind === 'header' && activeIndex > overIndex ? overIndex + 1 : overIndex
  if (targetIndex === activeIndex) return null

  const reordered = arrayMove(rows, activeIndex, targetIndex)
  const newIndex = reordered.findIndex((r) => r.id === activeId)
  const toSectionIndex = sectionIndexAtPosition(reordered, newIndex)
  const insertIndex = insertIndexInSection(reordered, newIndex, toSectionIndex)

  const fromSectionIndex = sectionIndexAtPosition(rows, activeIndex)
  const fromInsertIndex = insertIndexInSection(rows, activeIndex, fromSectionIndex)
  if (toSectionIndex === fromSectionIndex && insertIndex === fromInsertIndex) return null

  return { toSectionIndex, insertIndex }
}

// Resolves where a brand-new task should be inserted, given the insert
// button's `over` at drop time. Deliberately distinct from resolveCommit:
// there's no "from" position to diff against (the button's own array
// position is arbitrary bookkeeping, not a real placement), so no
// arrayMove/no-op-guard step - and no direction sensitivity, since there's
// no prior position to approach from. Hovering a header means "top of that
// section", same as resolveCommit.
export function resolveInsertTarget<T extends { id: number }>(
  rows: Row<T>[],
  overId: UniqueIdentifier
): { sectionIndex: number; insertIndex: number } {
  const overIndex = locateRow(rows, overId)
  const overRow = rows[overIndex]
  if (overRow.kind === 'header') return { sectionIndex: overRow.sectionIndex, insertIndex: 0 }
  const sectionIndex = sectionIndexAtPosition(rows, overIndex)
  return { sectionIndex, insertIndex: insertIndexInSection(rows, overIndex, sectionIndex) }
}
