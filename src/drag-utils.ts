import type { UniqueIdentifier } from '@dnd-kit/abstract'
import { arrayMove } from '@dnd-kit/helpers'
import type { ReactNode } from 'react'

// A single flat list of rows is what dnd-kit actually sorts, using each row's
// full-array position as its sort index. Section membership is derived from
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

// The FAB, folded into the same flat sortable list as a genuine draggable -
// always the array's last row. Unlike insert-slot/expanded, it DOES
// participate in the normal live-shift strategy (see DraggableList's
// shouldLiveShift) - dragging it toward the top of the list should open a
// gap through the intervening rows exactly like dragging a real task does.
type InsertButtonRow = {
  kind: 'insert-button'
  id: typeof INSERT_BUTTON_ID
}

// An empty, content-less droppable row appended after each section's items.
// It's the explicit "drop at the end of this section" target, so the last
// item keeps its natural size/hit-area instead of being inflated with tail
// padding. Landing on it resolves to insertIndex = end of the section. The
// LAST section's tail flexes to fill the remaining viewport (see the
// component), giving a large, forgiving "drop past everything" zone.
type SectionTailRow = {
  kind: 'section-tail'
  id: `tail:${number}`
  sectionIndex: number
  isLast: boolean
}

export type Row<T> =
  | HeaderRow
  | ItemRow<T>
  | InsertSlotRow
  | ExpandedRow
  | InsertButtonRow
  | SectionTailRow

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
        rows.push({ kind: 'insert-slot', id: 'insert-slot', content: insertSlot.content })
      }
      if (expandedSlot?.afterItemId === item.id) {
        rows.push({ kind: 'expanded', id: item.id, content: expandedSlot.content })
      } else {
        rows.push({ kind: 'item', id: item.id, item })
      }
    })

    if (insertSlot?.sectionIndex === sectionIndex && insertSlot.index === section.items.length) {
      rows.push({ kind: 'insert-slot', id: 'insert-slot', content: insertSlot.content })
    }
  })

  // The FAB goes BEFORE the trailing tail so the tail is always the very last
  // droppable slot - otherwise a drag to the bottom of the page could settle
  // AFTER the tail (in the FAB's slot), which isn't a real position.
  if (hasInsertButton) {
    rows.push({ kind: 'insert-button', id: INSERT_BUTTON_ID })
  }

  // Only the LAST section gets a tail: a single flexible drop zone that fills
  // the space below the list so a task or the FAB can be dropped past the last
  // row and land at the end. (Inner sections don't need one - dropping at a
  // section boundary is handled by the next header / the reorder resolution.)
  const lastSectionIndex = sections.length - 1
  if (lastSectionIndex >= 0) {
    rows.push({
      kind: 'section-tail',
      id: `tail:${lastSectionIndex}`,
      sectionIndex: lastSectionIndex,
      isLast: true,
    })
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

// Counts item/expanded rows belonging to `sectionIndex` among rows[0..uptoIndex),
// optionally skipping `excludeId`. Membership is derived positionally (the
// nearest preceding header governs a row's section) rather than from a per-row
// field, so it stays correct after arrayMove leaves the moved row's own section
// stale. Shared by the drop-resolution helpers below.
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
// array as it was BEFORE the drop plus the active row's final full-array
// position (from source.index at drag end - every non-tail row is a sortable
// keyed by its full-array index). The live in-drag preview is handled entirely
// by dnd-kit's own optimistic sorting - this only runs once, at drag end, to
// translate the settled index back into the section/insert coordinates the app
// stores. Returns null for a no-op (dropped back where it started).
export function resolveCommit<T extends { id: number }>(
  rows: Row<T>[],
  activeId: UniqueIdentifier,
  toIndex: number
): { toSectionIndex: number; insertIndex: number } | null {
  const fromIndex = locateRow(rows, activeId)
  if (toIndex === fromIndex) return null

  const reordered = arrayMove(rows, fromIndex, toIndex)
  const newIndex = reordered.findIndex((r) => r.id === activeId)
  const toSectionIndex = sectionIndexAtPosition(reordered, newIndex)
  const insertIndex = countItemsInSection(reordered, toSectionIndex, newIndex)

  const fromSectionIndex = sectionIndexAtPosition(rows, fromIndex)
  const fromInsertIndex = countItemsInSection(rows, fromSectionIndex, fromIndex)
  if (toSectionIndex === fromSectionIndex && insertIndex === fromInsertIndex) return null

  return { toSectionIndex, insertIndex }
}

// Resolves where a brand-new task should be inserted, given the insert
// button's final full-array position at drop time. Deliberately distinct from
// resolveCommit: the button isn't a real placement being diffed against a
// prior one, so there's no no-op guard - wherever it settled is the requested
// insert point. The button row is itself a sortable, so we reconstruct the row
// order with it moved to its settled index, then read off the section + insert
// index at its new slot.
export function resolveInsertTarget<T extends { id: number }>(
  rows: Row<T>[],
  buttonId: UniqueIdentifier,
  toIndex: number
): { sectionIndex: number; insertIndex: number } {
  const fromIndex = locateRow(rows, buttonId)
  const reordered = arrayMove(rows, fromIndex, toIndex)
  const newIndex = reordered.findIndex((r) => r.id === buttonId)
  const sectionIndex = sectionIndexAtPosition(reordered, newIndex)
  return { sectionIndex, insertIndex: countItemsInSection(reordered, sectionIndex, newIndex) }
}

// Whether a droppable id is a section tail, and if so which section it ends.
export function tailSectionIndex(id: UniqueIdentifier): number | null {
  const match = /^tail:(\d+)$/.exec(String(id))
  return match ? Number(match[1]) : null
}

// Resolves a drop ONTO a section tail: the end of that section. The tail isn't
// a sortable group member - it's a plain droppable pinned at the bottom - so
// it's matched by the drop target's id rather than a settled index. `activeId`
// (when it's an existing item) is excluded from the count so a within-section
// drop to the end reports the correct index.
export function resolveTailDrop<T extends { id: number }>(
  rows: Row<T>[],
  sectionIndex: number,
  activeId?: UniqueIdentifier
): { sectionIndex: number; insertIndex: number } {
  return { sectionIndex, insertIndex: countItemsInSection(rows, sectionIndex, rows.length, activeId) }
}
