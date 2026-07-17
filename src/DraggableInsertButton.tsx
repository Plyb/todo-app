import { theme } from './theme'

export const FAB_BOTTOM = 24
export const FAB_RIGHT = 24
export const FAB_SIZE = 56

export function FabGlyph() {
  return <span style={{ fontSize: 28, lineHeight: 1 }}>+</span>
}

// A circular clone that follows the pointer while the FAB is dragged.
//
// Unlike task rows, the FAB's sortable source element is a 0-height list row
// pinned nowhere near the pointer, so dnd-kit's <DragOverlay> (which anchors
// to the source element's rect) can't position a FAB preview correctly - it
// lands top-left. Instead the parent tracks the live drag position (via
// DragDropProvider's onDragMove - dnd-kit swallows window pointer events once
// a drag is active, so a plain listener can't) and passes it here so the
// circle sits centered under the cursor, matching the old FAB's feel.
export function FabDragPreview({ x, y }: { x: number; y: number }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        width: FAB_SIZE,
        height: FAB_SIZE,
        transform: 'translate(-50%, -50%) scale(1.1)',
        borderRadius: '50%',
        background: theme.colors.brand,
        color: '#fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: theme.zIndex.fab + 1,
      }}
    >
      <FabGlyph />
    </div>
  )
}

type DraggableInsertButtonProps = {
  setNodeRef: (element: Element | null) => void
  setActivatorNodeRef: (element: Element | null) => void
  isDragging: boolean
  // Whether to show the dashed insertion placeholder. Driven entirely by the
  // parent (isFabDragging && past the dead zone) rather than the child's own
  // isDragging, so it can't desync from the dead-zone state on drop - which
  // caused a one-frame placeholder flash when releasing inside the dead zone.
  showPlaceholder?: boolean
  onTap?: () => void
}

// The FAB, folded into the same DragDropProvider as task drags as a real
// sortable row. States:
// - idle: 0-height list row, hosts the fixed-corner button (the drag handle)
// - dragging in dead zone: still collapsed, no placeholder (drag uncommitted)
// - dragging past dead zone: the dashed placeholder, live-positioned by
//   dnd-kit's optimistic sorting. The DragOverlay clone follows the pointer.
export function DraggableInsertButton({
  setNodeRef,
  setActivatorNodeRef,
  isDragging,
  showPlaceholder,
  onTap,
}: DraggableInsertButtonProps) {
  // The <li> (the sortable source/row) and the fixed-corner button are ALWAYS
  // rendered so the button never unmounts - unmounting it on drag start made
  // it blink out of existence for a frame around the drop. While dragging, the
  // row expands into the dashed placeholder and the button is just hidden (the
  // pointer-following FabDragPreview is the visible feedback instead).
  return (
    <li
      ref={setNodeRef}
      style={{ height: showPlaceholder ? undefined : 0, overflow: 'visible', listStyle: 'none' }}
    >
      {showPlaceholder ? (
        <div
          style={{
            height: 44,
            background: 'rgba(26,115,232,0.08)',
            borderRadius: theme.radii.md,
            border: `2px dashed ${theme.colors.brand}`,
            margin: '4px 0',
          }}
        />
      ) : null}
      <button
        ref={setActivatorNodeRef}
        aria-label="Add task"
        // A tap doesn't move far enough to activate a drag (see the FAB's 8px
        // distance sensor), so the native click fires - insert at the start.
        onClick={onTap}
        style={{
          position: 'fixed',
          bottom: FAB_BOTTOM,
          right: FAB_RIGHT,
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: '50%',
          background: theme.colors.brand,
          color: '#fff',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'pan-y',
          cursor: 'pointer',
          zIndex: theme.zIndex.fab,
          // Hidden (but still mounted) during the drag - the floating preview
          // is what the user sees following the pointer.
          visibility: isDragging ? 'hidden' : 'visible',
        }}
      >
        <FabGlyph />
      </button>
    </li>
  )
}
