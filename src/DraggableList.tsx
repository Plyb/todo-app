import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DragDropProvider, DragOverlay, useDroppable, useDragDropManager } from '@dnd-kit/react'
import { useSortable, isSortable } from '@dnd-kit/react/sortable'
import { PointerSensor, PointerActivationConstraints, Feedback, AutoScroller } from '@dnd-kit/dom'
import type { UniqueIdentifier } from '@dnd-kit/abstract'
import { theme } from './theme'
import {
  buildRows,
  resolveCommit,
  resolveInsertTarget,
  resolveTailDrop,
  tailSectionIndex,
  INSERT_BUTTON_ID,
  type Row,
} from './drag-utils'
import { DraggableInsertButton, FabDragPreview, FAB_SIZE } from './DraggableInsertButton'

const MOUSE_DRAG_ACTIVATION_PX = 8
const TOUCH_DRAG_DELAY_MS = 400
const TOUCH_DRAG_TOLERANCE_PX = 8
// The FAB starts dragging only after the pointer moves this far; below it, the
// press is a tap (insert at the start). A single threshold both disambiguates
// tap-vs-drag and prevents the placeholder from flashing on a plain tap.
const FAB_DRAG_ACTIVATION_PX = 8
// While the FAB stays within this distance of where the drag began, the drag
// is treated as "not yet committed": no insertion placeholder is shown and a
// release cancels instead of inserting. 1.5x the FAB's own radius gives a
// comfortable dead zone around its resting corner.
const FAB_DEAD_ZONE_PX = (FAB_SIZE / 2) * 1.5
// A press on a task that moves less than this counts as a tap (open the task),
// not a drag. dnd-kit swallows the native click for any press it started
// tracking - even sub-threshold jitter - so item taps are detected here from
// pointerdown/up coordinates instead of relying on the click event.
const TASK_TAP_TOLERANCE_PX = 8
// Height of a section's trailing drop zone (the empty droppable row after its
// items). Non-final sections use this fixed height; the final section's tail
// flexes to fill the rest of the viewport (see SECTION_TAIL_MIN_FILL usage).
const SECTION_TAIL_HEIGHT = 24

function toItemId(id: UniqueIdentifier): number {
  return typeof id === 'number' ? id : Number(id)
}

// A drag must be allowed to start even though each task row's content is a
// <button> (with a checkbox inside). The PointerSensor's DEFAULT
// preventActivation blocks any press that lands on an interactive element, so
// without this override pressing a task would only ever click it, never drag
// it. We only keep the genuine controls (the done checkbox, text inputs)
// non-draggable so they stay tappable/editable.
function preventActivation(event: { target: EventTarget | null }): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  return target.closest('input, textarea, [contenteditable="true"]') !== null
}

// The default PointerSensor already differentiates pointer types, but we want
// the old feel exactly: mouse starts a drag after an 8px move (tap-vs-drag
// disambiguation), touch after a 400ms hold with an 8px tolerance (so a
// scroll gesture isn't hijacked).
const pointerActivation = PointerSensor.configure({
  preventActivation,
  activationConstraints(event) {
    if (event.pointerType === 'touch') {
      return [
        new PointerActivationConstraints.Delay({
          value: TOUCH_DRAG_DELAY_MS,
          tolerance: TOUCH_DRAG_TOLERANCE_PX,
        }),
      ]
    }
    return [new PointerActivationConstraints.Distance({ value: MOUSE_DRAG_ACTIVATION_PX })]
  },
})

// The FAB starts a drag only after the pointer travels past the threshold, so
// a plain tap never enters drag state at all - no placeholder flash, and the
// resting button never has to hide/reappear. (An empty constraint list would
// activate instantly on pointerdown, turning every tap into a zero-length
// drag.) A distance constraint also covers touch here, since dragging the
// corner FAB is a deliberate gesture that shouldn't wait on a hold delay.
const fabPointerActivation = PointerSensor.configure({
  preventActivation,
  activationConstraints: [new PointerActivationConstraints.Distance({ value: FAB_DRAG_ACTIVATION_PX })],
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
  // Pointer-down coords for tap detection on item rows (see the <li> below).
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
    // The FAB disables just its drop animation (see fabNoDropAnimation).
    plugins: isInsertButton ? (defaults) => [...defaults, fabNoDropAnimation] : undefined,
  })

  if (row.kind === 'insert-button') {
    return (
      <DraggableInsertButton
        setNodeRef={ref}
        setActivatorNodeRef={handleRef}
        isDragging={isDragging}
        showPlaceholder={fabShowPlaceholder}
        onTap={onTapInsert}
      />
    )
  }

  if (row.kind === 'header') {
    return (
      <li ref={ref} style={{ listStyle: 'none' }}>
        {row.content}
      </li>
    )
  }

  if (row.kind === 'insert-slot') {
    return (
      <li ref={ref} data-insert-slot style={{ listStyle: 'none' }}>
        {row.content}
      </li>
    )
  }

  if (row.kind === 'expanded') {
    return (
      <li
        ref={ref}
        style={{ listStyle: 'none', position: 'relative', zIndex: 11 }}
        onClick={(e) => e.stopPropagation()}
      >
        {row.content}
      </li>
    )
  }

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

// The trailing drop zone of the last section. It's a plain droppable (NOT a
// sortable) pinned at the bottom, filling the remaining viewport, so a task or
// the FAB can be dropped past the last row and land at the end - without ever
// being able to settle *after* it (which a sortable tail allowed).
function SectionTail({ id, sectionIndex }: { id: UniqueIdentifier; sectionIndex: number }) {
  const { ref } = useDroppable({ id })
  return (
    <li
      ref={ref}
      data-section-tail={sectionIndex}
      style={{ listStyle: 'none', flex: '1 0 auto', minHeight: SECTION_TAIL_HEIGHT }}
    />
  )
}

// Suppresses dnd-kit's auto-scroll while `paused` is true. Used to stop the
// page from scrolling down when the FAB is merely hovering its own dead zone
// near the bottom-right corner (dragging past the dead zone re-enables it, so
// dropping at the true bottom still scrolls). Must live inside the provider.
function AutoScrollControl({ paused }: { paused: boolean }) {
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
  // Bumped on every drag end to remount the FAB's sortable row. The FAB always
  // belongs at the very end of the list, but dnd-kit retains the optimistic
  // position from the previous drag, so without a fresh mount the next drag's
  // placeholder would briefly appear where the last one ended. Remounting
  // resets it cleanly back to the end (where it sits invisibly until dragged).
  const [fabResetKey, setFabResetKey] = useState(0)

  const rows = useMemo(
    () => buildRows(sections, insertSlot, expandedSlot, insertButton !== undefined),
    [sections, insertSlot, expandedSlot, insertButton]
  )

  const allItems = sections.flatMap((s) => s.items)
  const activeItem = typeof activeId === 'number' ? allItems.find((t) => t.id === activeId) ?? null : null
  const isFabDragging = activeId === INSERT_BUTTON_ID
  // True while the FAB is being dragged but hasn't left its dead zone yet:
  // the preview still follows the pointer, but no placeholder is shown and a
  // release won't insert.
  const fabInDeadZone =
    isFabDragging &&
    fabDragPos != null &&
    fabDragStart.current != null &&
    Math.hypot(fabDragPos.x - fabDragStart.current.x, fabDragPos.y - fabDragStart.current.y) < FAB_DEAD_ZONE_PX

  const fabInOrAboveDeadZone =
    isFabDragging &&
    fabDragPos !== null &&
    fabDragStart.current !== null &&
    Math.abs(fabDragPos.x - fabDragStart.current.x) < FAB_DEAD_ZONE_PX

  return (
    <DragDropProvider
      // Replace the default PointerSensor with our tuned one (mouse distance /
      // touch delay) while keeping the default KeyboardSensor for a11y.
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
        const p = operation.position?.current
        if (p) {
          setFabDragPos({ x: p.x, y: p.y })
          fabDragStart.current = { x: p.x, y: p.y }
        }
        onDragStart?.()
      }}
      onDragMove={({ operation }) => {
        const p = operation.position?.current
        if (p) setFabDragPos({ x: p.x, y: p.y })
      }}
      onDragEnd={({ operation, canceled }) => {
        setActiveId(null)
        setFabDragPos(null)
        // Remount the FAB so its next drag starts cleanly at the end of the
        // list rather than at the position this drag left it.
        setFabResetKey((k) => k + 1)
        onDragEnd?.()
        if (canceled) return

        const { source } = operation
        if (!isSortable(source)) return
        const finalIndex = source.index
        // Dropped onto the last-section tail? (It's a plain droppable, not part
        // of the sortable sequence, so it's identified by the drop target id.)
        const droppedTailSection = tailSectionIndex(operation.target?.id ?? '')

        if (source.id === INSERT_BUTTON_ID) {
          // Released inside the dead zone (barely moved from the resting
          // corner) - treat it as a cancel, not an insertion.
          const start = fabDragStart.current
          const end = operation.position?.current
          const inDeadZone =
            start != null &&
            end != null &&
            Math.hypot(end.x - start.x, end.y - start.y) < FAB_DEAD_ZONE_PX
          if (inDeadZone) return
          const target =
            droppedTailSection != null
              ? resolveTailDrop(rows, droppedTailSection)
              : resolveInsertTarget(rows, INSERT_BUTTON_ID, finalIndex)
          insertButton?.onRequestInsert(target.sectionIndex, target.insertIndex)
        } else if (droppedTailSection != null) {
          const target = resolveTailDrop(rows, droppedTailSection, source.id)
          onReorder(toItemId(source.id), target.sectionIndex, target.insertIndex)
        } else {
          const commit = resolveCommit(rows, source.id, finalIndex)
          if (commit) onReorder(toItemId(source.id), commit.toSectionIndex, commit.insertIndex)
        }
      }}
    >
      {/* A flex column that fills at least the viewport height, so the final
          section's tail row (flex: 1) can expand to cover all the empty space
          below the list as a large "drop at the end" target. */}
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100%',
        }}
      >
        {rows.map((row, i) =>
          row.kind === 'section-tail' ? (
            <SectionTail key={String(row.id)} id={row.id} sectionIndex={row.sectionIndex} />
          ) : (
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
          )
        )}
      </ul>

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

      <AutoScrollControl paused={fabInOrAboveDeadZone} />
    </DragDropProvider>
  )
}
