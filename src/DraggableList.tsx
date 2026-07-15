import React, { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { theme } from './theme'
import { buildRows, resolveCommit, type Row } from './drag-utils'
import { findInsertIndex } from './pointer-utils'

const MOUSE_DRAG_ACTIVATION_PX = 8
const TOUCH_DRAG_DELAY_MS = 400
const TOUCH_DRAG_TOLERANCE_PX = 8
// The very last droppable row has no dead space below it to register a drop
// target on (its own padding is whatever its content needs), so there's
// nowhere to drop "at the end of the list" without landing exactly on that
// row. This reserves some of that space as part of its own droppable rect.
const LAST_SECTION_DROP_TAIL_HEIGHT = 96

function toItemId(id: UniqueIdentifier): number {
  return typeof id === 'number' ? id : Number(id)
}

// Adapted for the flat row DOM structure: rows carry `data-section-index`
// (headers and items) so contiguous runs of it delimit a section, and
// `data-item-row` marks the subset findInsertIndex should measure against
// (excluding the header itself and any insert-slot/expanded row, neither of
// which carries data-section-index at all).
export function getInsertSlotAt(container: HTMLElement, clientY: number): { sectionIndex: number; index: number } {
  const rowEls = Array.from(container.querySelectorAll<HTMLElement>('[data-section-index]'))
  if (rowEls.length === 0) return { sectionIndex: 0, index: 0 }

  const groups: { sectionIndex: number; els: HTMLElement[] }[] = []
  for (const el of rowEls) {
    const sectionIndex = Number(el.dataset.sectionIndex)
    const last = groups[groups.length - 1]
    if (last?.sectionIndex === sectionIndex) last.els.push(el)
    else groups.push({ sectionIndex, els: [el] })
  }

  let target = groups[groups.length - 1]
  for (const group of groups) {
    if (clientY < group.els[group.els.length - 1].getBoundingClientRect().bottom) {
      target = group
      break
    }
  }

  const itemEls = target.els.filter((el) => el.dataset.itemRow !== undefined)
  return { sectionIndex: target.sectionIndex, index: findInsertIndex(itemEls, clientY) }
}

type Section<T> = {
  header?: React.ReactNode
  items: T[]
}

type DraggableListProps<T extends { id: number }> = {
  sections: Section<T>[]
  onReorder: (draggedId: number, toSectionIndex: number, insertIndex: number) => void
  renderItem: (item: T) => React.ReactNode
  itemStyle?: (item: T) => React.CSSProperties
  onItemClick?: (id: number) => void
  insertSlot?: { index: number; sectionIndex: number; content: React.ReactNode }
  expandedSlot?: { afterItemId: number; content: React.ReactNode }
  listRef?: React.RefObject<HTMLDivElement | null>
  onDragStart?: () => void
  onDragEnd?: () => void
}

function findLastDroppableIndex<T>(rows: Row<T>[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].kind === 'item' || rows[i].kind === 'header') return i
  }
  return -1
}

function SortableRow<T extends { id: number }>({
  row,
  renderItem,
  itemStyle,
  onItemClick,
  extraPaddingBottom,
}: {
  row: Row<T>
  renderItem: (item: T) => React.ReactNode
  itemStyle?: (item: T) => React.CSSProperties
  onItemClick?: (id: number) => void
  extraPaddingBottom: number
}) {
  const isTask = row.kind === 'item'
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: isTask ? undefined : { draggable: true, droppable: row.kind !== 'header' },
    // Lets dnd-kit's own settle-FLIP animate any non-drag-caused reorder (the
    // FAB's insert-slot appearing/moving, a section header shifting) via its
    // built-in per-row rect diffing, while still suppressing it during/just
    // after a REAL drag (`wasDragging`) - the live shift-preview already
    // handles motion there, and re-animating on top of it doubles it.
    animateLayoutChanges: ({ wasDragging }) => !wasDragging,
  })

  const cssTransform = CSS.Transform.toString(transform)

  switch (row.kind) {
    case 'header':
      return (
        <li
          ref={setNodeRef}
          data-section-index={row.sectionIndex}
          style={{ listStyle: 'none', paddingBottom: extraPaddingBottom, transform: cssTransform, transition }}
        >
          {row.content}
        </li>
      )
    case 'insert-slot':
      return (
        <li ref={setNodeRef} data-insert-slot style={{ listStyle: 'none', transform: cssTransform, transition }}>
          {row.content}
        </li>
      )
    case 'expanded':
      return (
        <li
          ref={setNodeRef}
          style={{ listStyle: 'none', position: 'relative', zIndex: 11, transform: cssTransform, transition }}
          onClick={(e) => e.stopPropagation()}
        >
          {row.content}
        </li>
      )
    case 'item':
      return (
        <li
          ref={setNodeRef}
          data-section-index={row.sectionIndex}
          data-item-row
          {...attributes}
          {...listeners}
          onClick={(e) => {
            e.stopPropagation()
            if (!isDragging) onItemClick?.(row.item.id)
          }}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            paddingTop: 12,
            paddingRight: 16,
            paddingBottom: 12 + extraPaddingBottom,
            paddingLeft: 16,
            borderBottom: `1px solid ${theme.colors.divider}`,
            boxSizing: 'border-box',
            position: 'relative',
            ...itemStyle?.(row.item),
            transform: cssTransform,
            transition,
            opacity: isDragging ? 0 : undefined,
            zIndex: isDragging ? 0 : 1,
          }}
        >
          {renderItem(row.item)}
        </li>
      )
  }
}

export function DraggableList<T extends { id: number }>({
  sections,
  onReorder,
  renderItem,
  itemStyle,
  onItemClick,
  insertSlot,
  expandedSlot,
  listRef,
  onDragStart,
  onDragEnd,
}: DraggableListProps<T>) {
  const [activeId, setActiveId] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DRAG_ACTIVATION_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_DRAG_DELAY_MS, tolerance: TOUCH_DRAG_TOLERANCE_PX } }),
  )

  const rows = useMemo(() => buildRows(sections, insertSlot, expandedSlot), [sections, insertSlot, expandedSlot])
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows])
  const tailAnchorIndex = findLastDroppableIndex(rows)

  const allItems = sections.flatMap((s) => s.items)
  const activeItem = activeId !== null ? allItems.find((t) => t.id === activeId) ?? null : null

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(toItemId(active.id))
    onDragStart?.()
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over) {
      const commit = resolveCommit(rows, active.id, over.id)
      if (commit) onReorder(toItemId(active.id), commit.toSectionIndex, commit.insertIndex)
    }
    setActiveId(null)
    onDragEnd?.()
  }

  function handleDragCancel() {
    setActiveId(null)
    onDragEnd?.()
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div ref={listRef}>
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rows.map((row, i) => (
              <SortableRow
                key={String(row.id)}
                row={row}
                renderItem={renderItem}
                itemStyle={itemStyle}
                onItemClick={onItemClick}
                extraPaddingBottom={i === tailAnchorIndex ? LAST_SECTION_DROP_TAIL_HEIGHT : 0}
              />
            ))}
          </ul>
        </SortableContext>
      </div>

      <DragOverlay>
        {activeItem && (
          <div
            style={{
              padding: '12px 16px',
              boxSizing: 'border-box',
              borderBottom: `1px solid ${theme.colors.divider}`,
              backgroundColor: 'white',
              opacity: 0.85,
              transform: 'scale(1.05)',
              transformOrigin: 'center center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            }}
          >
            {renderItem(activeItem)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
