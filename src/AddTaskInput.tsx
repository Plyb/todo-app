import React, { useState } from 'react'
import { isPrimaryButton, findInsertIndex } from './pointer-utils'
import { rankBetween } from './rank-utils'
import type { Task } from './tasks'

export type NewTaskInput = {
  insertIndex: number
}

export type FabDragState = {
  pointerX: number
  pointerY: number
  insertIndex: number | null
}

export const FAB_BOTTOM = 24
export const FAB_RIGHT = 24
export const FAB_SIZE = 56

export function computeInsertRank(tasks: Task[], insertIndex: number): string {
  const prev = insertIndex > 0 ? tasks[insertIndex - 1] : null
  const next = insertIndex < tasks.length ? tasks[insertIndex] : null
  return rankBetween(prev, next)
}

type AddTaskFabProps = {
  tasks: Task[]
  listRef: React.RefObject<HTMLUListElement | null>
  onRequestInsert: (insertIndex: number) => void
}

export function AddTaskFab({ tasks, listRef, onRequestInsert }: AddTaskFabProps) {
  const [fabDragState, setFabDragState] = useState<FabDragState | null>(null)

  function isNearFabStart(clientX: number, clientY: number): boolean {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const fabCenterX = vw - FAB_RIGHT - FAB_SIZE / 2
    const fabCenterY = vh - FAB_BOTTOM - FAB_SIZE / 2
    const dx = clientX - fabCenterX
    const dy = clientY - fabCenterY
    return Math.sqrt(dx * dx + dy * dy) < FAB_SIZE * 1.5
  }

  function getInsertIndexFromPointer(clientY: number): number {
    if (!listRef.current) return tasks.length
    const listItems = Array.from(
      listRef.current.querySelectorAll<HTMLElement>('li:not([data-insert-slot])')
    )
    return findInsertIndex(listItems, clientY)
  }

  function handleFabPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!isPrimaryButton(e)) return
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    setFabDragState({
      pointerX: e.clientX,
      pointerY: e.clientY,
      insertIndex: null,
    })
  }

  function handleFabPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (fabDragState === null) return
    const atFab = isNearFabStart(e.clientX, e.clientY)
    setFabDragState({
      pointerX: e.clientX,
      pointerY: e.clientY,
      insertIndex: atFab ? null : getInsertIndexFromPointer(e.clientY),
    })
  }

  function handleFabPointerUp(_e: React.PointerEvent<HTMLButtonElement>) {
    if (fabDragState === null) return
    if (fabDragState.insertIndex === null) {
      setFabDragState(null)
      return
    }
    const insertIndex = fabDragState.insertIndex
    setFabDragState(null)
    onRequestInsert(insertIndex)
  }

  function handleFabClick() {
    if (fabDragState !== null) return
    onRequestInsert(0)
  }

  const fabPlaceholderIndex =
    fabDragState !== null && fabDragState.insertIndex !== null ? fabDragState.insertIndex : null

  return (
    <>
      {fabPlaceholderIndex !== null && (
        <div
          data-fab-placeholder
          data-insert-index={fabPlaceholderIndex}
          style={{ display: 'none' }}
        />
      )}
      <button
        aria-label="Add task"
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={handleFabPointerUp}
        onClick={handleFabClick}
        style={{
          position: 'fixed',
          bottom: FAB_BOTTOM,
          right: FAB_RIGHT,
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: '50%',
          background: '#1a73e8',
          color: '#fff',
          border: 'none',
          fontSize: 28,
          lineHeight: 1,
          cursor: fabDragState !== null ? 'grabbing' : 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          touchAction: 'none',
          transition: 'box-shadow 0.15s ease, transform 0.15s ease',
          transform: fabDragState !== null ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        +
      </button>
    </>
  )
}

type NewTaskInputFieldProps = {
  insertIndex: number
  onBlur: (e: React.FocusEvent<HTMLInputElement>, insertIndex: number) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, insertIndex: number) => void
}

export function NewTaskInputField({ insertIndex, onBlur, onKeyDown }: NewTaskInputFieldProps) {
  function autoFocusOnAppearance(el: HTMLInputElement | null) {
    el?.focus()
  }

  return (
    <input
      ref={autoFocusOnAppearance}
      type="text"
      placeholder="Task name"
      onBlur={(e) => onBlur(e, insertIndex)}
      onKeyDown={(e) => onKeyDown(e, insertIndex)}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 12px',
        fontSize: 16,
        border: '2px solid #1a73e8',
        borderRadius: 6,
        outline: 'none',
        margin: '4px 0',
      }}
    />
  )
}
