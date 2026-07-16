import React, { useMemo, useRef, useState } from 'react'
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
    // dnd-kit's naive index-range strategy shifts EVERY row between
    // activeIndex and overIndex - fine for tasks, the insert button, and
    // non-first headers (which should track a section boundary moving), but
    // wrong for the very first header (nothing above it can move) and for
    // insert-slot/expanded rows, which should stay put during a live drag
    // and only ever move via the settle FLIP afterward.
    strategy: shouldLiveShift ? undefined : () => null,
    // Read by the sensors' bypassActivationConstraint (see DraggableList) to
    // give this one draggable instant activation, matching the old FAB's feel.
    data: isInsertButton ? { instantActivate: true } : undefined,
  })

  const setRefs = (node: HTMLLIElement | null) => {
    setNodeRef(node)
    elementRef.current = node
  }

  const dragStyle = { transform: CSS.Transform.toString(transform), transition }

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
