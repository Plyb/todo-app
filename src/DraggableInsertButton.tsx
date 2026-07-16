import React from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { theme } from './theme'

export const FAB_BOTTOM = 24
export const FAB_RIGHT = 24
export const FAB_SIZE = 56

export function FabGlyph() {
  return <span style={{ fontSize: 28, lineHeight: 1 }}>+</span>
}

// The DragOverlay clone - mirrors the resting button's circular styling
// (matching the original raised/"grabbing" look) since DragOverlay renders
// independently of the resting button, which is hidden while dragging.
export function FabDragPreview() {
  return (
      <div
      style={{
        position: 'fixed',
        right: FAB_RIGHT,
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: '50%',
        background: theme.colors.brand,
        color: '#fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: 'scale(1.1)',
      }}
    >
      <FabGlyph />
    </div>
  )
}

type DraggableInsertButtonProps = {
  setNodeRef: (element: HTMLLIElement | null) => void
  setActivatorNodeRef: (element: HTMLElement | null) => void
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
  isDragging: boolean
  hasTarget: boolean
  dragStyle?: React.CSSProperties
}

// The FAB, folded into the same DndContext as task drags. Three states,
// driven entirely by isDragging/hasTarget (no dead-zone radius or pointer
// tracking of our own - "no target resolved yet" from dnd-kit's own
// collision detection already covers "pointer still near the FAB's own
// corner, or over blank space"):
// - idle: 0-height list row, hosts the fixed-corner button (the drag handle)
// - dragging, no target: stays invisible - DragOverlay's floating clone is
//   the only visible feedback
// - dragging, target resolved: the dashed placeholder, positioned by
//   dnd-kit's own live-shift transform exactly like a task mid-reorder
export function DraggableInsertButton({
  setNodeRef,
  setActivatorNodeRef,
  attributes,
  listeners,
  isDragging,
  hasTarget,
  dragStyle,
}: DraggableInsertButtonProps) {
  if (!isDragging) {
    return (
      <li ref={setNodeRef} style={{ height: 0, overflow: 'visible', listStyle: 'none' }}>
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Add task"
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
            touchAction: 'none',
            cursor: 'pointer',
            zIndex: theme.zIndex.fab,
          }}
        >
          <FabGlyph />
        </button>
      </li>
    )
  }

  if (!hasTarget) {
    return <li ref={setNodeRef} style={{ height: 0, listStyle: 'none' }} />
  }

  return (
    <li ref={setNodeRef} style={{ listStyle: 'none', ...dragStyle }}>
      <div
        style={{
          height: 44,
          background: 'rgba(26,115,232,0.08)',
          borderRadius: theme.radii.md,
          border: `2px dashed ${theme.colors.brand}`,
          margin: '4px 0',
        }}
      />
    </li>
  )
}
