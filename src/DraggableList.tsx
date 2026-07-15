import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
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

// Shared by both animation paths so a row never visibly changes speed
// switching between them: dnd-kit's own live shift-preview (while a real
// drag is in progress) and the hand-rolled FLIP below (every other reflow -
// the FAB's insert-slot appearing, a header settling after a drop, the
// expanded panel opening). Matches dnd-kit's own default, stated explicitly
// so a future dnd-kit upgrade can't silently desync the two.
const ROW_SHIFT_TRANSITION_CONFIG = { duration: 200, easing: 'ease' }
const ROW_SHIFT_TRANSITION = 'transform 200ms ease'

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

// The tail drop-zone only ever belongs to the array's OWN final row, and
// only when that row is a real item/header (droppable-eligible). If the
// final row is currently an insert-slot or expanded panel (both fully
// droppable-disabled - see SortableRow), redirecting the padding onto an
// earlier row instead would open a phantom gap between that row and the
// insert-slot/panel, visibly displacing it downward. Accepting no tail drop
// zone in that narrow, transient state is better than that.
function findTailPaddingIndex<T>(rows: Row<T>[]): number {
  const lastIndex = rows.length - 1
  if (lastIndex < 0) return -1
  const lastRow = rows[lastIndex]
  return lastRow.kind === 'item' || lastRow.kind === 'header' ? lastIndex : -1
}

// FLIP-animates a row to its new position whenever its own measured top
// changes between renders, for any reason OTHER than a live drag (dnd-kit's
// own shift-preview owns the row's transform then - see SortableRow). This
// is what animates the FAB's insert-slot appearing/moving, a header settling
// after a drop, and the expanded panel opening/closing: dnd-kit's built-in
// layout-change animation only fires around an actual drag session, so it
// can't cover reflows caused by anything else - confirmed empirically, not
// just in theory, so this hand-rolled path is deliberate, not a fallback.
//
// Mutates the DOM node directly (not React state) - the same technique the
// old AnimatedHeader used - so React's own style prop never has to fight an
// in-flight imperative transform, and so this can run unconditionally on
// every commit without risking a setState-driven update loop.
function useRowShiftFlip(nodeRef: React.RefObject<HTMLElement | null>, isDragActive: boolean) {
  const previousTop = useRef<number | null>(null)
  const wasDragActive = useRef(isDragActive)

  useLayoutEffect(() => {
    const node = nodeRef.current
    if (!node) return

    if (isDragActive) {
      // dnd-kit's own live shift-preview owns this row's transform while a
      // drag is active - don't compare against a position that's itself an
      // artifact of that live transform.
      previousTop.current = null
      wasDragActive.current = true
      return
    }

    const newTop = node.getBoundingClientRect().top
    const justEndedDrag = wasDragActive.current
    wasDragActive.current = false
    const delta = !justEndedDrag && previousTop.current !== null ? previousTop.current - newTop : 0
    previousTop.current = newTop
    if (delta === 0) return

    node.style.transition = 'none'
    node.style.transform = `translateY(${delta}px)`
    node.getBoundingClientRect() // flush layout so the starting transform above is registered
    requestAnimationFrame(() => {
      node.style.transition = ROW_SHIFT_TRANSITION
      node.style.transform = ''
    })
  })
}

function SortableRow<T extends { id: number }>({
  row,
  renderItem,
  itemStyle,
  onItemClick,
  extraPaddingBottom,
  isDragActive,
}: {
  row: Row<T>
  renderItem: (item: T) => React.ReactNode
  itemStyle?: (item: T) => React.CSSProperties
  onItemClick?: (id: number) => void
  extraPaddingBottom: number
  isDragActive: boolean
}) {
  const isTask = row.kind === 'item'
  const elementRef = useRef<HTMLLIElement | null>(null)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: isTask ? undefined : { draggable: true, droppable: row.kind !== 'header' },
    // Every reflow OTHER than a live drag is handled by useRowShiftFlip
    // instead (see above) - dnd-kit's own layout-change animation proved
    // unreliable for those non-drag cases in practice.
    animateLayoutChanges: () => false,
    // Only real tasks should be displaced by dnd-kit's own live shift-preview
    // during an active drag: its naive index-range strategy shifts EVERY row
    // between activeIndex and overIndex, which would otherwise also drag a
    // header along for the ride whenever one happens to fall in that range
    // (e.g. the very first header, or a section boundary header crossed
    // while dragging) - headers/insert-slot/expanded rows must stay put
    // during a live drag and only ever move via the settle FLIP afterward.
    strategy: isTask ? undefined : () => null,
    transition: ROW_SHIFT_TRANSITION_CONFIG,
  })

  const setRefs = (node: HTMLLIElement | null) => {
    setNodeRef(node)
    elementRef.current = node
  }

  useRowShiftFlip(elementRef, isDragActive)
  // Only ever declare transform/transition here while a real drag is active
  // (dnd-kit's own live values) - omitting the keys entirely the rest of the
  // time leaves them under the FLIP effect's exclusive imperative control,
  // instead of React resetting them out from under it on the next render.
  const dragStyle = isDragActive ? { transform: CSS.Transform.toString(transform), transition } : undefined

  switch (row.kind) {
    case 'header':
      return (
        <li
          ref={setRefs}
          data-section-index={row.sectionIndex}
          style={{ listStyle: 'none', paddingBottom: extraPaddingBottom, ...dragStyle }}
        >
          {row.content}
        </li>
      )
    case 'insert-slot':
      return (
        <li ref={setRefs} data-insert-slot style={{ listStyle: 'none', ...dragStyle }}>
          {row.content}
        </li>
      )
    case 'expanded':
      return (
        <li
          ref={setRefs}
          style={{ listStyle: 'none', position: 'relative', zIndex: 11, ...dragStyle }}
          onClick={(e) => e.stopPropagation()}
        >
          {row.content}
        </li>
      )
    case 'item':
      return (
        <li
          ref={setRefs}
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
            boxSizing: 'border-box',
            position: 'relative',
            paddingBottom: extraPaddingBottom,
            ...dragStyle,
            opacity: isDragging ? 0 : undefined,
            zIndex: isDragging ? 0 : 1,
          }}
        >
          {/* A separate inner box carries the visible padding/divider, so the
              outer li's extraPaddingBottom (tail drop-zone dead space) only
              extends its droppable hit area - it never drags the divider
              line down with it. */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${theme.colors.divider}`,
              boxSizing: 'border-box',
              position: 'relative',
              ...itemStyle?.(row.item),
            }}
          >
            {renderItem(row.item)}
          </div>
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
  const tailPaddingIndex = findTailPaddingIndex(rows)
  const isDragActive = activeId !== null

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
                extraPaddingBottom={i === tailPaddingIndex ? LAST_SECTION_DROP_TAIL_HEIGHT : 0}
                isDragActive={isDragActive}
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
