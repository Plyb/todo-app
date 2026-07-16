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
import { buildRows, resolveCommit, resolveInsertTarget, INSERT_BUTTON_ID, type Row } from './drag-utils'
import { DraggableInsertButton, FabDragPreview } from './DraggableInsertButton'

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
  insertButton?: { onRequestInsert: (sectionIndex: number, insertIndex: number) => void }
  onDragStart?: () => void
  onDragEnd?: () => void
}

// The tail drop-zone only ever belongs to the array's OWN final row, and
// only when that row is a real item/header (droppable-eligible). An
// insert-button row is always the array's last row when present, but is
// fully droppable-disabled - skip past it rather than treating its presence
// as disqualifying the tail-drop-zone entirely. An insert-slot/expanded row
// being last (rarer, transient) still disqualifies it - redirecting the
// padding onto an earlier row would open a phantom gap and visibly displace
// it downward instead.
function findTailPaddingIndex<T>(rows: Row<T>[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].kind === 'item' || rows[i].kind === 'header') return i
    if (rows[i].kind !== 'insert-button') return -1
  }
  return -1
}

// FLIP-animates a row to its new position whenever its own measured top
// changes between renders, for any reason OTHER than a real drag (dnd-kit's
// own shift-preview owns the row's transform then - see SortableRow and
// DraggableList's `suppressFlip`). This is what animates a header settling
// after a drop, the expanded panel opening/closing, and a NewTaskInputField
// row being spliced in: dnd-kit's built-in layout-change animation only
// fires around an actual drag session, so it can't cover reflows caused by
// anything else - confirmed empirically, not just in theory, so this
// hand-rolled path is deliberate, not a fallback.
//
// Mutates the DOM node directly (not React state) - the same technique the
// old AnimatedHeader used - so React's own style prop never has to fight an
// in-flight imperative transform, and so this can run unconditionally on
// every commit without risking a setState-driven update loop.
function useRowShiftFlip(nodeRef: React.RefObject<HTMLElement | null>, skip: boolean) {
  const previousTop = useRef<number | null>(null)
  const wasSkipped = useRef(skip)
  const pendingRaf = useRef<number | null>(null)
  // The Y-offset this hook currently has applied via node.style.transform (0
  // when settled). getBoundingClientRect reflects live transforms, so a
  // measurement taken while a previous snap is still mid-flight has to
  // subtract this back out to recover the row's TRUE natural position -
  // otherwise a rapid run of reflows (the FAB moving on every pointermove,
  // faster than one settle per animation frame) compounds a contaminated
  // delta on top of an already-wrong one instead of converging. This also
  // makes a duplicate effect invocation with no real change in between (e.g.
  // React StrictMode's dev-mode double-invoke of every commit's effects,
  // not just on mount) a true no-op instead of wiping out the first
  // invocation's just-applied transform.
  const appliedOffset = useRef(0)

  useLayoutEffect(() => {
    const node = nodeRef.current
    if (!node) return

    if (skip) {
      // Either dnd-kit's own live shift-preview owns this row's transform (a
      // real drag), or the FAB is actively resolving positions and we're
      // deliberately not animating at all - either way, don't compare
      // against a position that could be an artifact of an in-flight
      // transform, or of the high-frequency phase we're skipping.
      if (pendingRaf.current !== null) {
        cancelAnimationFrame(pendingRaf.current)
        pendingRaf.current = null
      }
      previousTop.current = null
      wasSkipped.current = true
      return
    }

    const measuredTop = node.getBoundingClientRect().top
    const trueTop = measuredTop - appliedOffset.current
    const justStoppedSkipping = wasSkipped.current
    wasSkipped.current = false
    const delta = !justStoppedSkipping && previousTop.current !== null ? previousTop.current - trueTop : 0
    previousTop.current = trueTop
    // No real movement since the last invocation - leave any in-flight
    // animation exactly as it is (don't cancel its pending rAF either).
    if (delta === 0) return

    if (pendingRaf.current !== null) {
      cancelAnimationFrame(pendingRaf.current)
    }

    node.style.transition = 'none'
    node.style.transform = `translateY(${delta}px)`
    appliedOffset.current = delta
    node.getBoundingClientRect() // flush layout so the starting transform above is registered
    pendingRaf.current = requestAnimationFrame(() => {
      pendingRaf.current = null
      node.style.transition = ROW_SHIFT_TRANSITION
      node.style.transform = ''
      appliedOffset.current = 0
    })
  })
}

function SortableRow<T extends { id: number }>({
  row,
  renderItem,
  itemStyle,
  onItemClick,
  extraPaddingBottom,
  isRealDragActive,
  suppressFlip,
}: {
  row: Row<T>
  renderItem: (item: T) => React.ReactNode
  itemStyle?: (item: T) => React.CSSProperties
  onItemClick?: (id: number) => void
  extraPaddingBottom: number
  isRealDragActive: boolean
  suppressFlip: boolean
}) {
  const isTask = row.kind === 'item'
  const isInsertButton = row.kind === 'insert-button'
  // Every OTHER header legitimately needs to shift live as a preceding
  // section grows/shrinks during the drag (that's the whole point of the
  // boundary moving to track where the section actually starts) - only the
  // very first section's header has nothing above it that could ever change,
  // so it alone should never be displaced by a live drag.
  const isTopHeader = row.kind === 'header' && row.sectionIndex === 0
  // The insert button DOES live-shift normally, like a task - dragging it
  // toward the top of the list should open a gap through the intervening
  // rows exactly like a real task reorder preview does.
  const shouldLiveShift = isTask || isInsertButton || (row.kind === 'header' && !isTopHeader)
  const elementRef = useRef<HTMLLIElement | null>(null)
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    over,
  } = useSortable({
    id: row.id,
    disabled: isTask
      ? undefined
      : isInsertButton
        ? { draggable: false, droppable: true }
        : { draggable: true, droppable: row.kind !== 'header' },
    // Every reflow OTHER than a live drag is handled by useRowShiftFlip
    // instead (see above) - dnd-kit's own layout-change animation proved
    // unreliable for those non-drag cases in practice.
    animateLayoutChanges: () => false,
    // dnd-kit's naive index-range strategy shifts EVERY row between
    // activeIndex and overIndex - fine for tasks, the insert button, and
    // non-first headers (which should track a section boundary moving), but
    // wrong for the very first header (nothing above it can move) and for
    // insert-slot/expanded rows, which should stay put during a live drag
    // and only ever move via the settle FLIP afterward.
    strategy: shouldLiveShift ? undefined : () => null,
    transition: ROW_SHIFT_TRANSITION_CONFIG,
    // Read by the sensors' bypassActivationConstraint (see DraggableList) to
    // give this one draggable instant activation, matching the old FAB's feel.
    data: isInsertButton ? { instantActivate: true } : undefined,
  })

  const setRefs = (node: HTMLLIElement | null) => {
    setNodeRef(node)
    elementRef.current = node
  }

  useRowShiftFlip(elementRef, suppressFlip)
  // Only ever declare transform/transition here while a REAL drag is active
  // (dnd-kit's own live values) - omitting the keys entirely the rest of the
  // time leaves them under the FLIP effect's exclusive imperative control,
  // instead of React resetting them out from under it on the next render.
  const dragStyle = isRealDragActive ? { transform: CSS.Transform.toString(transform), transition } : undefined

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
    case 'insert-button':
      return (
        <DraggableInsertButton
          setNodeRef={setRefs}
          setActivatorNodeRef={setActivatorNodeRef}
          attributes={attributes}
          listeners={listeners}
          isDragging={isDragging}
          hasTarget={over != null}
          dragStyle={dragStyle}
        />
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
  insertButton,
  onDragStart,
  onDragEnd,
}: DraggableListProps<T>) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: MOUSE_DRAG_ACTIVATION_PX },
      // The insert button wants the same instant pointer-capture feel the
      // old hand-rolled FAB had - no perceptible delay before it starts
      // following the pointer - while regular tasks keep the normal
      // distance threshold for tap-vs-drag disambiguation.
      bypassActivationConstraint: ({ activeNode }) => activeNode.data.current?.instantActivate === true,
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: TOUCH_DRAG_DELAY_MS, tolerance: TOUCH_DRAG_TOLERANCE_PX },
      bypassActivationConstraint: ({ activeNode }) => activeNode.data.current?.instantActivate === true,
    }),
  )

  const rows = useMemo(
    () => buildRows(sections, insertSlot, expandedSlot, insertButton !== undefined),
    [sections, insertSlot, expandedSlot, insertButton]
  )
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows])
  const tailPaddingIndex = findTailPaddingIndex(rows)
  const isRealDragActive = activeId !== null
  // dnd-kit's own live shift-preview owns every row's transform during a
  // real drag (including the insert button's own) - the hand-rolled FLIP
  // must stay out of its way entirely then.
  const suppressFlip = isRealDragActive

  const allItems = sections.flatMap((s) => s.items)
  const activeItem = typeof activeId === 'number' ? allItems.find((t) => t.id === activeId) ?? null : null

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id)
    onDragStart?.()
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (active.id === INSERT_BUTTON_ID) {
      const target = over ? resolveInsertTarget(rows, over.id) : null
      insertButton?.onRequestInsert(target?.sectionIndex ?? 0, target?.insertIndex ?? 0)
    } else if (over) {
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
              isRealDragActive={isRealDragActive}
              suppressFlip={suppressFlip}
            />
          ))}
        </ul>
      </SortableContext>

      <DragOverlay>
        {activeId === INSERT_BUTTON_ID ? (
          <FabDragPreview />
        ) : activeItem ? (
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
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
