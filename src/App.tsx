import { useEffect, useRef, useState } from 'react'
import { createTask, loadTasks, type Task } from './tasks'

type NewTaskInput = {
  insertIndex: number // position in tasks array where this input is shown
}

type DragState = {
  isActive: boolean
  pointerX: number
  pointerY: number
  insertIndex: number | null // null = dragged back to origin / cancelled
}

const FAB_BOTTOM = 24
const FAB_RIGHT = 24
const FAB_SIZE = 56

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTaskInput, setNewTaskInput] = useState<NewTaskInput | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)

  const listRef = useRef<HTMLUListElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let isMounted = true
    loadTasks().then((loadedTasks) => {
      if (isMounted) setTasks(loadedTasks)
    })
    return () => { isMounted = false }
  }, [])

  // Auto-focus the input whenever it appears
  useEffect(() => {
    if (newTaskInput !== null) {
      inputRef.current?.focus()
    }
  }, [newTaskInput])

  function openInputAtBottom() {
    setNewTaskInput({ insertIndex: tasks.length })
  }

  async function commitInput(value: string, insertIndex: number, andOpenAnother: boolean) {
    const trimmed = value.trim()
    if (!trimmed) {
      setNewTaskInput(null)
      return
    }
    const task = await createTask(trimmed)
    setTasks((prev) => {
      const next = [...prev]
      next.splice(insertIndex, 0, task)
      return next
    })
    if (andOpenAnother) {
      setNewTaskInput({ insertIndex: insertIndex + 1 })
    } else {
      setNewTaskInput(null)
    }
  }

  function handleInputBlur(e: React.FocusEvent<HTMLInputElement>, insertIndex: number) {
    const value = e.currentTarget.value
    // commitInput handles empty value by closing without creating
    commitInput(value, insertIndex, false)
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>, insertIndex: number) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitInput(e.currentTarget.value, insertIndex, true)
    } else if (e.key === 'Escape') {
      setNewTaskInput(null)
    }
  }

  // --- Drag handling for FAB ---

  function getInsertIndexFromPointer(clientY: number): number {
    if (!listRef.current) return tasks.length
    const listItems = Array.from(
      listRef.current.querySelectorAll<HTMLElement>('li[data-task-item]')
    )
    for (let i = 0; i < listItems.length; i++) {
      const rect = listItems[i].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return tasks.length
  }

  function isFabPosition(clientX: number, clientY: number): boolean {
    // Check if pointer is near the FAB's resting position (bottom-right corner area)
    // We use the viewport dimensions to define a "home zone"
    const vw = window.innerWidth
    const vh = window.innerHeight
    const fabCenterX = vw - FAB_RIGHT - FAB_SIZE / 2
    const fabCenterY = vh - FAB_BOTTOM - FAB_SIZE / 2
    const dx = clientX - fabCenterX
    const dy = clientY - fabCenterY
    return Math.sqrt(dx * dx + dy * dy) < FAB_SIZE * 1.5
  }

  function handleFabPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    // Only initiate drag on primary button, no modifier keys
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId)
    setDragState({
      isActive: true,
      pointerX: e.clientX,
      pointerY: e.clientY,
      insertIndex: null,
    })
  }

  function handleFabPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragState?.isActive) return
    const atFab = isFabPosition(e.clientX, e.clientY)
    setDragState({
      isActive: true,
      pointerX: e.clientX,
      pointerY: e.clientY,
      insertIndex: atFab ? null : getInsertIndexFromPointer(e.clientY),
    })
  }

  function handleFabPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragState?.isActive) return
    const atFab = isFabPosition(e.clientX, e.clientY)
    if (atFab || dragState.insertIndex === null) {
      // Cancelled — dragged back to origin or didn't move far
      setDragState(null)
      return
    }
    const insertIndex = dragState.insertIndex
    setDragState(null)
    setNewTaskInput({ insertIndex })
  }

  // Build the rendered list items, interleaving the input if present
  function renderListItems() {
    const items: React.ReactNode[] = []

    // Determine drag placeholder index
    const placeholderIndex =
      dragState?.isActive && dragState.insertIndex !== null ? dragState.insertIndex : null

    for (let slot = 0; slot <= tasks.length; slot++) {
      // Insert drag placeholder at this position
      if (placeholderIndex === slot) {
        items.push(
          <li
            key="drag-placeholder"
            style={{
              height: 44,
              background: 'rgba(26,115,232,0.08)',
              borderRadius: 6,
              border: '2px dashed #1a73e8',
              margin: '4px 0',
              transition: 'height 0.15s ease, opacity 0.15s ease',
              opacity: 1,
              listStyle: 'none',
            }}
          />
        )
      }

      // Insert text input at this position
      if (newTaskInput !== null && newTaskInput.insertIndex === slot) {
        items.push(
          <li key="new-task-input" style={{ listStyle: 'none', margin: '4px 0' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Task name"
              onBlur={(e) => handleInputBlur(e, slot)}
              onKeyDown={(e) => handleInputKeyDown(e, slot)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 12px',
                fontSize: 16,
                border: '2px solid #1a73e8',
                borderRadius: 6,
                outline: 'none',
              }}
            />
          </li>
        )
      }

      if (slot < tasks.length) {
        items.push(
          <li key={tasks[slot].id} data-task-item style={{ padding: '8px 0' }}>
            {tasks[slot].name}
          </li>
        )
      }
    }

    return items
  }

  return (
    <main>
      <ul ref={listRef} style={{ padding: 0, listStyle: 'none', margin: 0 }}>
        {renderListItems()}
      </ul>

      {/* Floating Action Button */}
      <button
        ref={fabRef}
        aria-label="Add task"
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={handleFabPointerUp}
        onClick={() => {
          if (!dragState) openInputAtBottom()
        }}
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
          cursor: dragState?.isActive ? 'grabbing' : 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          touchAction: 'none',
          transition: 'box-shadow 0.15s ease, transform 0.15s ease',
          transform: dragState?.isActive ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        +
      </button>
    </main>
  )
}
