import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DragDropProvider, DragOverlay, useDroppable, useDragDropManager } from '@dnd-kit/react'
import { useSortable, isSortable } from '@dnd-kit/react/sortable'
import { PointerSensor, PointerActivationConstraints, Feedback, AutoScroller } from '@dnd-kit/dom'
import { CollisionPriority, type UniqueIdentifier } from '@dnd-kit/abstract'
import { theme } from './theme'
import {
  buildRows,
  resolveCommit,
  resolveInsertTarget,
  resolveEndDrop,
  INSERT_BUTTON_ID,
  LIST_DROPPABLE_ID,
  type Row,
} from './drag-utils'
import { DraggableInsertButton, FabDragPreview, FAB_SIZE } from './DraggableInsertButton'

const DRAG_ACTIVATION_PX = 8
const TOUCH_DRAG_DELAY_MS = 400
const TOUCH_DRAG_TOLERANCE_PX = 8
// 1.5x the FAB's own radius gives a comfortable dead zone around its resting corner.
const FAB_DEAD_ZONE_PX = (FAB_SIZE / 2) * 1.5
const TASK_TAP_TOLERANCE_PX = 8

function toItemId(id: UniqueIdentifier): number {
  return typeof id === 'number' ? id : Number(id)
}

function isWithinDeadZone(start: { x: number; y: number }, end: { x: number; y: number }): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) < FAB_DEAD_ZONE_PX
}


const pointerActivation = PointerSensor.configure({
  activationConstraints(event) {
    if (event.pointerType === 'touch') {
      return [
        new PointerActivationConstraints.Delay({
          value: TOUCH_DRAG_DELAY_MS,
          tolerance: TOUCH_DRAG_TOLERANCE_PX,
        }),
      ]
    }
    return [new PointerActivationConstraints.Distance({ value: DRAG_ACTIVATION_PX })]
  },
})

// An empty constraint list would activate instantly on pointerdown, turning
// every tap into a zero-length drag. A distance constraint also covers touch
// here, since dragging the corner FAB is a deliberate gesture that shouldn't
// wait on a hold delay.
const fabPointerActivation = PointerSensor.configure({
  activationConstraints: [new PointerActivationConstraints.Distance({ value: DRAG_ACTIVATION_PX })],
})

// The FAB keeps default feedback (element promotion drives its isDragging
// reactivity + placeholder), but with NO drop animation: the default one
// detaches/animates the fixed-corner button on release, making it blink out
// for a moment before snapping back. Disabling just the drop animation fixes
// that without breaking the drag-state reactivity that feedback:'none' does.
const fabNoDropAnimation = Feedback.configure({ dropAnimation: null })

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

function ListRow<T extends { id: number }>({
  row,
  index,
  renderItem,
  itemStyle,
  onItemClick,
  onTapInsert,
  fabShowPlaceholder,
}: {
  row: Row<T>
  index: number
  renderItem: (item: T) => React.ReactNode
  itemStyle?: (item: T) => React.CSSProperties
  onItemClick?: (id: number) => void
  onTapInsert?: () => void
  fabShowPlaceholder?: boolean
}) {
  const isInsertButton = row.kind === 'insert-button'
  const disabled =
    isInsertButton
      ? { droppable: true }
      : row.kind === 'header' && index === 0
      ? true
      : row.kind === 'item'
      ? undefined
      : { draggable: true }
  const tapOrigin = useRef<{ x: number; y: number } | null>(null)
  const { ref, handleRef, isDragging } = useSortable({
    id: row.id,
    index,
    disabled,
    // Apply the tuned pointer sensor per-draggable so the activation threshold
    // is guaranteed (relying on the provider-level sensor let items fall back
    // to dnd-kit's 5px default, which made tap-jitter start unwanted drags and
    // swallow the tap). The FAB uses its own instant-ish variant.
    sensors: isInsertButton ? [fabPointerActivation] : [pointerActivation],
    plugins: isInsertButton ? (defaults) => [...defaults, fabNoDropAnimation] : undefined,
  })

  switch (row.kind) {
    case 'insert-button':
      return (
        <DraggableInsertButton
          ref={ref}
          handleRef={handleRef}
          isDragging={isDragging}
          showPlaceholder={fabShowPlaceholder}
          onTap={onTapInsert}
        />
      )

    case 'header':
      return (
        <li ref={ref} style={{ listStyle: 'none' }}>
          {row.content}
        </li>
      )

    case 'insert-slot':
      return (
        <li ref={ref} data-insert-slot style={{ listStyle: 'none' }}>
          {row.content}
        </li>
      )

    case 'expanded':
      return (
        <li
          ref={ref}
          style={{ listStyle: 'none', position: 'relative', zIndex: 11 }}
          onClick={(e) => e.stopPropagation()}
        >
          {row.content}
        </li>
      )

    default: {
      if (row.kind !== 'item') return null

      const itemId = row.item.id
      return (
        <li
          ref={ref}
          data-item-row
          // dnd-kit suppresses the native click for any press it began tracking
          // (even sub-threshold jitter), so we detect the tap ourselves from the
          // pointer travel between down and up rather than using onClick.
          onPointerDown={(e) => {
            tapOrigin.current = { x: e.clientX, y: e.clientY }
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            const origin = tapOrigin.current
            tapOrigin.current = null
            // origin is only null for a pointerup with no captured pointerdown on this row (rare).
            if (isDragging || !origin) return
            const traveled = Math.hypot(e.clientX - origin.x, e.clientY - origin.y)
            if (traveled < TASK_TAP_TOLERANCE_PX) onItemClick?.(itemId)
          }}
          style={{
            listStyle: 'none',
            cursor: isDragging ? 'grabbing' : 'grab',
            boxSizing: 'border-box',
            position: 'relative',
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.colors.divider}`,
            zIndex: isDragging ? 0 : 1,
            touchAction: 'pan-y`',
            ...itemStyle?.(row.item),
            // Applied AFTER itemStyle so a dragging row is always fully hidden -
            // the DragOverlay clone is the only visible copy. (itemStyle may set
            // its own opacity for selection fading, which must not win here.)
            ...(isDragging ? { opacity: 0 } : null),
          }}
        >
          {renderItem(row.item)}
        </li>
      )
    }
  }
}

// The wrapping <ul> as a plain droppable so a drag released below the last row
// lands at the end of the list. CollisionPriority.Lowest is load-bearing: the
// container geometrically contains every item droppable, so without it it would
// out-compete a hovered item near its vertical center. Must render inside
// DragDropProvider since useDroppable reads the manager from context. flex:
// '1 0 auto' makes it fill the remaining height of its flex-column parent (so
// the drop-past-end zone reaches the viewport bottom without overflowing it
// when a sibling like the view-selector button is present).
function ListContainer({ children }: { children: React.ReactNode }) {
  const { ref } = useDroppable({ id: LIST_DROPPABLE_ID, collisionPriority: CollisionPriority.Lowest })
  return (
    <ul
      ref={ref}
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        flex: '1 0 auto',
      }}
    >
      {children}
    </ul>
  )
}

function PausableAutoScrollControl({ paused }: { paused: boolean }) {
  const manager = useDragDropManager()
  useEffect(() => {
    const plugins = manager?.plugins as Array<{ disabled: boolean }> | undefined
    const scroller = plugins?.find((p) => p instanceof AutoScroller)
    if (scroller) scroller.disabled = paused
  }, [manager, paused])
  return null
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
  // Live pointer position during a drag, sourced from dnd-kit's onDragMove
  // (a plain window listener can't see moves - dnd-kit captures them once a
  // drag activates). Only used to position the FAB's pointer-following clone.
  const [fabDragPos, setFabDragPos] = useState<{ x: number; y: number } | null>(null)
  // Where the FAB drag began, used to measure the dead zone (see below). Held
  // in a ref since it's only read inside event handlers, never rendered.
  const fabDragStart = useRef<{ x: number; y: number } | null>(null)
  const [fabResetKey, setFabResetKey] = useState(0)

  const rows = useMemo(
    () => buildRows(sections, insertSlot, expandedSlot, insertButton !== undefined),
    [sections, insertSlot, expandedSlot, insertButton]
  )

  const allItems = sections.flatMap((s) => s.items)
  const activeItem = typeof activeId === 'number' ? allItems.find((t) => t.id === activeId) ?? null : null
  const isFabDragging = activeId === INSERT_BUTTON_ID
  const fabInDeadZone =
    isFabDragging &&
    fabDragPos !== null &&
    fabDragStart.current !== null &&
    isWithinDeadZone(fabDragStart.current, fabDragPos)

  // Deliberately x-only, not the 2D dead zone: any horizontal movement in this column should disable auto-scroll.
  const fabInOrAboveDeadZone =
    isFabDragging &&
    fabDragPos !== null &&
    fabDragStart.current !== null &&
    Math.abs(fabDragPos.x - fabDragStart.current.x) < FAB_DEAD_ZONE_PX

  return (
    <DragDropProvider
      sensors={(defaults) => [
        pointerActivation,
        ...defaults.filter((s) => s !== PointerSensor),
      ]}
      onDragStart={({ operation }) => {
        if (operation.source) setActiveId(operation.source.id)
        // Seed the FAB preview position immediately so it's visible on the
        // very first dragging frame - otherwise there's a one-frame gap
        // between the button hiding (isDragging) and the first onDragMove
        // positioning the preview, which reads as a flash right after the
        // drag threshold is crossed.
        if (operation.source?.id === INSERT_BUTTON_ID) {
          const pos = operation.position?.current
          if (pos) {
            setFabDragPos({ x: pos.x, y: pos.y })
            fabDragStart.current = { x: pos.x, y: pos.y }
          }
        }
        onDragStart?.()
      }}
      onDragMove={({ operation }) => {
        if (operation.source?.id !== INSERT_BUTTON_ID) return
        const pos = operation.position?.current
        if (pos) setFabDragPos({ x: pos.x, y: pos.y })
      }}
      onDragEnd={({ operation, canceled }) => {
        setActiveId(null)
        setFabDragPos(null)
        // Remount the FAB so its next drag starts cleanly at the end of the
        // list: dnd-kit retains the optimistic position from the previous
        // drag otherwise.
        setFabResetKey((k) => k + 1)
        onDragEnd?.()
        if (canceled) return

        const { source } = operation
        // Type-narrowing guard for source.index: only sortable rows are ever
        // draggable sources, so this isn't expected to fire at real drag-end.
        if (!isSortable(source)) return
        const finalIndex = source.index
        const droppedOnContainer = operation.target?.id === LIST_DROPPABLE_ID

        if (source.id === INSERT_BUTTON_ID) {
          const start = fabDragStart.current
          const end = operation.position?.current
          const inDeadZone = start !== null && end !== null && isWithinDeadZone(start, end)
          if (inDeadZone) return
          // Unlike a real item, the FAB has no pointer-anchored droppable shape,
          // so at drop it collides with the whole-list container rather than the
          // hovered row - `droppedOnContainer` is true even for a mid-list drop.
          // Its settled sortable index (maintained by dnd-kit's optimistic
          // sorting off row-to-row hovers, independent of the drop target) does
          // reflect where it landed, including the end, so always resolve from it.
          const target = resolveInsertTarget(rows, finalIndex)
          insertButton?.onRequestInsert(target.sectionIndex, target.insertIndex)
        } else if (droppedOnContainer) {
          const target = resolveEndDrop(rows, source.id)
          onReorder(toItemId(source.id), target.sectionIndex, target.insertIndex)
        } else {
          const commit = resolveCommit(rows, source.id, finalIndex)
          if (commit) onReorder(toItemId(source.id), commit.toSectionIndex, commit.insertIndex)
        }
      }}
    >
      <ListContainer>
        {rows.map((row, i) => (
          <ListRow
            key={row.kind === 'insert-button' ? `insert-button:${fabResetKey}` : String(row.id)}
            row={row}
            index={i}
            renderItem={renderItem}
            itemStyle={itemStyle}
            onItemClick={onItemClick}
            onTapInsert={() => insertButton?.onRequestInsert(0, 0)}
            fabShowPlaceholder={isFabDragging && !fabInDeadZone}
          />
        ))}
      </ListContainer>

      {/* Item drags use dnd-kit's DragOverlay: the source row renders at
          opacity 0 and this scaled clone tracks the pointer. (The FAB has its
          own pointer-following preview - see DraggableInsertButton - because
          its 0-height source row can't anchor the overlay correctly.) */}
      <DragOverlay>
        {activeItem ? (
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

      {isFabDragging && fabDragPos ? <FabDragPreview x={fabDragPos.x} y={fabDragPos.y} /> : null}

      <PausableAutoScrollControl paused={fabInOrAboveDeadZone} />
    </DragDropProvider>
  )
}
