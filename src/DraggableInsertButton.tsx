import React from 'react'
import { theme, fabPlaceholder } from './theme'

export const FAB_BOTTOM = 24
export const FAB_RIGHT = 24
export const FAB_SIZE = 56

export function FabGlyph() {
  return <span style={{ fontSize: 28, lineHeight: 1 }}>+</span>
}

const fabCircleStyle: React.CSSProperties = {
  width: FAB_SIZE,
  height: FAB_SIZE,
  borderRadius: '50%',
  background: theme.colors.brand,
  color: '#fff',
  boxShadow: theme.shadows.fabCircle,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'system-ui',
}

// A circular clone that follows the pointer while the FAB is dragged.
// dnd-kit's <DragOverlay> anchors to the source element's rect, but the FAB's
// source is a 0-height row nowhere near the pointer, so it can't position a
// preview correctly. The parent tracks position itself via onDragMove (a
// plain window listener won't see moves - dnd-kit swallows them during a
// drag) and passes it in here.
export function FabDragPreview({ x, y }: { x: number; y: number }) {
  return (
    <div
      style={{
        ...fabCircleStyle,
        position: 'fixed',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%) scale(1.1)',
        pointerEvents: 'none',
        zIndex: theme.zIndex.fab + 1,
      }}
    >
      <FabGlyph />
    </div>
  )
}

type DraggableInsertButtonProps = {
  ref: (element: Element | null) => void
  handleRef: (element: Element | null) => void
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
  ref,
  handleRef,
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
      ref={ref}
      style={{ height: showPlaceholder ? undefined : 0, overflow: 'visible', listStyle: 'none' }}
    >
      {showPlaceholder ? (
        <div
          style={{
            height: fabPlaceholder.height,
            background: fabPlaceholder.backgroundColor,
            borderRadius: theme.radii.md,
            border: `${fabPlaceholder.borderStyle} ${theme.colors.brand}`,
            margin: '4px 0',
          }}
        />
      ) : null}
      <button
        ref={handleRef}
        aria-label="Add task"
        // The FAB's 8px Distance constraint means anything past that is a
        // drag, and dnd-kit suppresses the native click once it starts
        // tracking - so onClick only fires on a genuine tap. onTap inserts at
        // the top of the first section (onRequestInsert(0, 0)).
        onClick={onTap}
        style={{
          ...fabCircleStyle,
          position: 'fixed',
          bottom: FAB_BOTTOM,
          right: FAB_RIGHT,
          border: 'none',
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
