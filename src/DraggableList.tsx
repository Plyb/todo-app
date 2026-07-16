import React, { useMemo, useRef, useState } from 'react'
import { DragDropProvider, DragOverlay } from '@dnd-kit/react'
import { useSortable, isSortable } from '@dnd-kit/react/sortable'
import { PointerSensor, PointerActivationConstraints, Feedback } from '@dnd-kit/dom'
import type { UniqueIdentifier } from '@dnd-kit/abstract'
import { theme } from './theme'
import {
  buildRows,
  resolveCommit,
  resolveInsertTarget,
  isSortableRow,
  sortableIndexOf,
  INSERT_BUTTON_ID,
  type Row,
} from './drag-utils'
import { DraggableInsertButton, FabDragPreview } from './DraggableInsertButton'

const MOUSE_DRAG_ACTIVATION_PX = 8
const TOUCH_DRAG_DELAY_MS = 400
const TOUCH_DRAG_TOLERANCE_PX = 8
// The FAB starts dragging only after the pointer moves this far; below it, the
// press is a tap (insert at the start). A single threshold both disambiguates
// tap-vs-drag and prevents the placeholder from flashing on a plain tap.
const FAB_DRAG_ACTIVATION_PX = 8
// A press on a task that moves less than this counts as a tap (open the task),
// not a drag. dnd-kit swallows the native click for any press it started
// tracking - even sub-threshold jitter - so item taps are detected here from
// pointerdown/up coordinates instead of relying on the click event.
const TASK_TAP_TOLERANCE_PX = 8
// The very last droppable row has no dead space below it to register a drop
// target on (its own padding is whatever its content needs), so there's
// nowhere to drop "at the end of the list" without landing exactly on that
// row. This reserves some of that space as part of its own droppable rect.
const LAST_SECTION_DROP_TAIL_HEIGHT = 96

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

// A row that dnd-kit sorts: an item or the FAB. `index` is its position among
// the sortable rows only (headers/insert-slot/expanded are excluded), which
// is the index space dnd-kit's optimistic sorting operates in.
function SortableRow<T extends { id: number }>({
  row,
  index,
  renderItem,
  itemStyle,
  onItemClick,
  onTapInsert,
  extraPaddingBottom,
}: {
  row: Row<T>
  index: number
  renderItem: (item: T) => React.ReactNode
  itemStyle?: (item: T) => React.CSSProperties
  onItemClick?: (id: number) => void
  onTapInsert?: () => void
  extraPaddingBottom: number
}) {
  const isInsertButton = row.kind === 'insert-button'
  const isHeader = row.kind === 'header'
  // Pointer-down coords for tap detection on item rows (see the <li> below).
  const tapOrigin = useRef<{ x: number; y: number } | null>(null)
  const { ref, handleRef, isDragging } = useSortable({
    id: row.id,
    index,
    // Headers are drop targets (so a cross-section drag registers over them
    // and they animate as items shift past) but never draggable themselves.
    // The FAB can be dragged but should never itself be a drop target; items
    // are freely draggable and droppable.
    disabled: isHeader ? { draggable: true } : isInsertButton ? { droppable: true } : undefined,
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
        onTap={onTapInsert}
      />
    )
  }

  if (row.kind === 'header') {
    return (
      <li ref={ref} data-section-index={row.sectionIndex} style={{ listStyle: 'none', paddingBottom: extraPaddingBottom }}>
        {row.content}
      </li>
    )
  }

  if (row.kind !== 'item') return null

  const itemId = row.item.id
  return (
    <li
      ref={ref}
      data-section-index={row.sectionIndex}
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
        paddingBottom: extraPaddingBottom,
        opacity: isDragging ? 0 : undefined,
        zIndex: isDragging ? 0 : 1,
        touchAction: 'none',
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

// A row dnd-kit never touches: a header, the new-task input slot, or the
// expanded panel. These stay put during a drag (never draggable, never a drop
// target), which is exactly what keeps the first header pinned and every
// header immovable.
function StaticRow<T extends { id: number }>({
  row,
  extraPaddingBottom,
}: {
  row: Row<T>
  extraPaddingBottom: number
}) {
  switch (row.kind) {
    case 'header':
      return (
        <li data-section-index={row.sectionIndex} style={{ listStyle: 'none', paddingBottom: extraPaddingBottom }}>
          {row.content}
        </li>
      )
    case 'insert-slot':
      return (
        <li data-insert-slot style={{ listStyle: 'none' }}>
          {row.content}
        </li>
      )
    case 'expanded':
      return (
        <li
          style={{ listStyle: 'none', position: 'relative', zIndex: 11 }}
          onClick={(e) => e.stopPropagation()}
        >
          {row.content}
        </li>
      )
    default:
      return null
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
  // Live pointer position during a drag, sourced from dnd-kit's onDragMove
  // (a plain window listener can't see moves - dnd-kit captures them once a
  // drag activates). Only used to position the FAB's pointer-following clone.
  const [fabDragPos, setFabDragPos] = useState<{ x: number; y: number } | null>(null)
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
  const tailPaddingIndex = findTailPaddingIndex(rows)

  const allItems = sections.flatMap((s) => s.items)
  const activeItem = typeof activeId === 'number' ? allItems.find((t) => t.id === activeId) ?? null : null
  const isFabDragging = activeId === INSERT_BUTTON_ID

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
        if (p) setFabDragPos({ x: p.x, y: p.y })
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
        const finalSortableIndex = source.index

        if (source.id === INSERT_BUTTON_ID) {
          // Reaching onDragEnd means the FAB was actually dragged past the 8px
          // threshold (a plain tap never activates a drag - it's handled by
          // onTap/onRequestInsert below), so this is always a real placement.
          const target = resolveInsertTarget(rows, INSERT_BUTTON_ID, finalSortableIndex)
          insertButton?.onRequestInsert(target.sectionIndex, target.insertIndex)
        } else {
          const commit = resolveCommit(rows, source.id, finalSortableIndex)
          if (commit) onReorder(toItemId(source.id), commit.toSectionIndex, commit.insertIndex)
        }
      }}
    >
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {rows.map((row, i) =>
          isSortableRow(rows, i) ? (
            <SortableRow
              key={row.kind === 'insert-button' ? `insert-button:${fabResetKey}` : String(row.id)}
              row={row}
              index={sortableIndexOf(rows, i)}
              renderItem={renderItem}
              itemStyle={itemStyle}
              onItemClick={onItemClick}
              onTapInsert={() => insertButton?.onRequestInsert(0, 0)}
              extraPaddingBottom={i === tailPaddingIndex ? LAST_SECTION_DROP_TAIL_HEIGHT : 0}
            />
          ) : (
            <StaticRow
              key={String(row.id)}
              row={row}
              extraPaddingBottom={i === tailPaddingIndex ? LAST_SECTION_DROP_TAIL_HEIGHT : 0}
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
    </DragDropProvider>
  )
}
