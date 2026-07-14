import React, { useRef, useState } from 'react'
import { isPrimaryButton } from './pointer-utils'
import { theme } from './theme'
import { getInsertSlotAt } from './DraggableList'

export type NewTaskInput = {
  sectionIndex: number
  insertIndex: number
}

export type InsertSlotTarget = {
  sectionIndex: number
  index: number
}

export type FabDragState = {
  pointerX: number
  pointerY: number
  slot: InsertSlotTarget | null
}

export const FAB_BOTTOM = 24
export const FAB_RIGHT = 24
export const FAB_SIZE = 56
const FAB_START_DEAD_ZONE_RADIUS = FAB_SIZE * 1.5

type AddTaskFabProps = {
  listRef: React.RefObject<HTMLDivElement | null>
  onRequestInsert: (sectionIndex: number, insertIndex: number) => void
  onDragInsertSlot: (slot: InsertSlotTarget | null) => void
}

// AddTaskFab uses raw pointer events rather than dnd-kit to enable immediate
// pointer-capture activation on pointerDown (vs. dnd-kit's sensor delays), a
// fixed-corner element that physically follows the pointer, and tap-vs-drag
// semantics with a cancel dead-zone (isNearFabStart). dnd-kit's sortable-list
// collision model doesn't accommodate these constraints. Revisit this choice if
// future requirements like auto-scroll or live reorder preview require integration.
export function AddTaskFab({ listRef, onRequestInsert, onDragInsertSlot }: AddTaskFabProps) {
  const [fabDragState, setFabDragState] = useState<FabDragState | null>(null)
  const didMoveRef = useRef(false)

  function isNearFabStart(clientX: number, clientY: number): boolean {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const fabCenterX = vw - FAB_RIGHT - FAB_SIZE / 2
    const fabCenterY = vh - FAB_BOTTOM - FAB_SIZE / 2
    const dx = clientX - fabCenterX
    const dy = clientY - fabCenterY
    return Math.sqrt(dx * dx + dy * dy) < FAB_START_DEAD_ZONE_RADIUS
  }

  function handleFabPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!isPrimaryButton(e)) return
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    didMoveRef.current = false
    setFabDragState({
      pointerX: e.clientX,
      pointerY: e.clientY,
      slot: null,
    })
  }

  function handleFabPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (fabDragState === null) return
    didMoveRef.current = true
    const atFab = isNearFabStart(e.clientX, e.clientY)
    const slot = atFab ? null : listRef.current ? getInsertSlotAt(listRef.current, e.clientY) : { sectionIndex: 0, index: 0 }
    setFabDragState({
      pointerX: e.clientX,
      pointerY: e.clientY,
      slot,
    })
    onDragInsertSlot(slot)
  }

  function handleFabPointerUp(_e: React.PointerEvent<HTMLButtonElement>) {
    if (fabDragState === null) return
    onDragInsertSlot(null)
    const { slot } = fabDragState
    const moved = didMoveRef.current
    setFabDragState(null)
    if (slot !== null) {
      onRequestInsert(slot.sectionIndex, slot.index)
    } else if (!moved) {
      onRequestInsert(0, 0)
    }
  }

  function handleFabPointerCancel() {
    onDragInsertSlot(null)
    setFabDragState(null)
  }

  return (
    <button
      aria-label="Add task"
      onPointerDown={handleFabPointerDown}
      onPointerMove={handleFabPointerMove}
      onPointerUp={handleFabPointerUp}
      onPointerCancel={handleFabPointerCancel}
      style={{
        position: 'fixed',
        ...(fabDragState !== null ? {
          top: fabDragState.pointerY - FAB_SIZE / 2,
          left: fabDragState.pointerX - FAB_SIZE / 2,
        } : {
          bottom: FAB_BOTTOM,
          right: FAB_RIGHT,
        }),
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: '50%',
        background: theme.colors.brand,
        color: '#fff',
        border: 'none',
        fontSize: 28,
        lineHeight: 1,
        zIndex: fabDragState !== null ? 2000 : undefined,
        cursor: fabDragState !== null ? 'grabbing' : 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
        transition: fabDragState !== null ? 'none' : 'box-shadow 0.15s ease, transform 0.15s ease',
        transform: fabDragState !== null ? 'scale(1.1)' : 'scale(1)',
      }}
    >
      +
    </button>
  )
}

type NewTaskInputFieldProps = {
  sectionIndex: number
  insertIndex: number
  onBlur: (e: React.FocusEvent<HTMLInputElement>, sectionIndex: number, insertIndex: number) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, sectionIndex: number, insertIndex: number) => void
}

export function NewTaskInputField({ sectionIndex, insertIndex, onBlur, onKeyDown }: NewTaskInputFieldProps) {
  function autoFocusOnAppearance(el: HTMLInputElement | null) {
    el?.focus()
  }

  return (
    <input
      ref={autoFocusOnAppearance}
      type="text"
      placeholder="Task name"
      onBlur={(e) => onBlur(e, sectionIndex, insertIndex)}
      onKeyDown={(e) => onKeyDown(e, sectionIndex, insertIndex)}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 12px',
        fontSize: theme.fontSizes.xl,
        border: `2px solid ${theme.colors.brand}`,
        borderRadius: theme.radii.md,
        outline: 'none',
        margin: '4px 0',
      }}
    />
  )
}
