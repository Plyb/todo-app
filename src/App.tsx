import { useEffect, useRef, useState } from 'react'
import { LexoRank } from 'lexorank'
import { createTask, loadTasks, updateTaskRank, type Task } from './tasks'
import { DraggableList } from './DraggableList'

type NewTaskInput = {
  insertIndex: number // position in tasks array where this input is shown
}

type FabDragState = {
  isActive: boolean
  pointerX: number
  pointerY: number
  insertIndex: number | null // null = dragged back to origin / cancelled
}

const FAB_BOTTOM = 24
const FAB_RIGHT = 24
const FAB_SIZE = 56

function computeNewRank(tasks: Task[], insertIndex: number, draggedTaskId: number): string {
  const others = tasks.filter((t) => t.id !== draggedTaskId)
  const prev = insertIndex > 0 ? others[insertIndex - 1] : null
  const next = insertIndex < others.length ? others[insertIndex] : null

  if (prev && next) {
    return LexoRank.parse(prev.rank).between(LexoRank.parse(next.rank)).toString()
  } else if (prev) {
    return LexoRank.parse(prev.rank).genNext().toString()
  } else if (next) {
    return LexoRank.parse(next.rank).genPrev().toString()
  } else {
    return LexoRank.middle().toString()
  }
}

function computeInsertRank(tasks: Task[], insertIndex: number): string {
  const prev = insertIndex > 0 ? tasks[insertIndex - 1] : null
  const next = insertIndex < tasks.length ? tasks[insertIndex] : null

  if (prev && next) {
    return LexoRank.parse(prev.rank).between(LexoRank.parse(next.rank)).toString()
  } else if (prev) {
    return LexoRank.parse(prev.rank).genNext().toString()
  } else if (next) {
    return LexoRank.parse(next.rank).genPrev().toString()
  } else {
    return LexoRank.middle().toString()
  }
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTaskInput, setNewTaskInput] = useState<NewTaskInput | null>(null)
  const [fabDragState, setFabDragState] = useState<FabDragState | null>(null)

  const taskListWrapperRef = useRef<HTMLDivElement>(null)
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

  function handleReorder(draggedId: number, insertIndex: number) {
    const newRank = computeNewRank(tasks, insertIndex, draggedId)
    const others = tasks.filter((t) => t.id !== draggedId)
    const draggedTask = tasks.find((t) => t.id === draggedId)!
    const updatedDragged = { ...draggedTask, rank: newRank }
    const newTasks = [
      ...others.slice(0, insertIndex),
      updatedDragged,
      ...others.slice(insertIndex),
    ]
    setTasks(newTasks)
    updateTaskRank(draggedId, newRank)
  }

  function openInputAtBottom() {
    setNewTaskInput({ insertIndex: tasks.length })
  }

  async function commitInput(value: string, insertIndex: number, andOpenAnother: boolean) {
    const trimmed = value.trim()
    if (!trimmed) {
      setNewTaskInput(null)
      return
    }
    const rank = computeInsertRank(tasks, insertIndex)
    const task = await createTask(trimmed, rank)
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
    if (!taskListWrapperRef.current) return tasks.length
    const listItems = Array.from(
      taskListWrapperRef.current.querySelectorAll<HTMLElement>('li[data-task-item]')
    )
    for (let i = 0; i < listItems.length; i++) {
      const rect = listItems[i].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return tasks.length
  }

  function isFabPosition(clientX: number, clientY: number): boolean {
    // Check if pointer is near the FAB's resting position (bottom-right corner area)
    const vw = window.innerWidth
    const vh = window.innerHeight
    const fabCenterX = vw - FAB_RIGHT - FAB_SIZE / 2
    const fabCenterY = vh - FAB_BOTTOM - FAB_SIZE / 2
    const dx = clientX - fabCenterX
    const dy = clientY - fabCenterY
    return Math.sqrt(dx * dx + dy * dy) < FAB_SIZE * 1.5
  }

  function handleFabPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId)
    setFabDragState({
      isActive: true,
      pointerX: e.clientX,
      pointerY: e.clientY,
      insertIndex: null,
    })
  }

  function handleFabPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!fabDragState?.isActive) return
    const atFab = isFabPosition(e.clientX, e.clientY)
    setFabDragState({
      isActive: true,
      pointerX: e.clientX,
      pointerY: e.clientY,
      insertIndex: atFab ? null : getInsertIndexFromPointer(e.clientY),
    })
  }

  function handleFabPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!fabDragState?.isActive) return
    const atFab = isFabPosition(e.clientX, e.clientY)
    if (atFab || fabDragState.insertIndex === null) {
      // Cancelled — dragged back to origin or didn't move far
      setFabDragState(null)
      return
    }
    const insertIndex = fabDragState.insertIndex
    setFabDragState(null)
    setNewTaskInput({ insertIndex })
  }

  const fabPlaceholderIndex =
    fabDragState?.isActive && fabDragState.insertIndex !== null ? fabDragState.insertIndex : null

  return (
    <main>
      <div ref={taskListWrapperRef}>
        <DraggableList
          items={tasks}
          onReorder={handleReorder}
          renderItem={(task) => task.name}
        />

        {/* Input slots for FAB drag placeholder and new-task text input */}
        <ul style={{ padding: 0, listStyle: 'none', margin: 0 }}>
          {Array.from({ length: tasks.length + 1 }, (_, slot) => (
            <li key={slot} style={{ listStyle: 'none' }}>
              {fabPlaceholderIndex === slot && (
                <div
                  style={{
                    height: 44,
                    background: 'rgba(26,115,232,0.08)',
                    borderRadius: 6,
                    border: '2px dashed #1a73e8',
                    margin: '4px 0',
                  }}
                />
              )}
              {newTaskInput !== null && newTaskInput.insertIndex === slot && (
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
                    margin: '4px 0',
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Floating Action Button */}
      <button
        ref={fabRef}
        aria-label="Add task"
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={handleFabPointerUp}
        onClick={() => {
          if (!fabDragState) openInputAtBottom()
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
          cursor: fabDragState?.isActive ? 'grabbing' : 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          touchAction: 'none',
          transition: 'box-shadow 0.15s ease, transform 0.15s ease',
          transform: fabDragState?.isActive ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        +
      </button>
    </main>
  )
}
