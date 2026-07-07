import { useEffect, useRef, useState } from 'react'
import { LexoRank } from 'lexorank'
import { loadTasks, updateTaskRank, type Task } from './tasks'

type DragState = {
  taskId: number
  startY: number
  currentY: number
  insertIndex: number
  rowHeight: number
}

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

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [dragState, setDragState] = useState<DragState | null>(null)

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const rowRefsMap = useRef<Map<number, HTMLLIElement>>(new Map())

  useEffect(() => {
    let isMounted = true

    loadTasks().then((loadedTasks) => {
      if (isMounted) {
        setTasks(loadedTasks)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  function getRowHeight(): number {
    const firstRef = rowRefsMap.current.values().next().value
    return firstRef?.getBoundingClientRect().height ?? 48
  }

  function computeInsertIndex(pointerY: number, draggedTaskId: number): number {
    const others = tasks.filter((t) => t.id !== draggedTaskId)
    for (let i = 0; i < others.length; i++) {
      const el = rowRefsMap.current.get(others[i].id)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (pointerY < rect.top + rect.height / 2) {
        return i
      }
    }
    return others.length
  }

  function handlePointerDown(e: React.PointerEvent<HTMLLIElement>, taskId: number) {
    // Only handle primary button (left click or single touch)
    if (e.button !== 0 && e.pointerType === 'mouse') return

    const startY = e.clientY

    longPressTimerRef.current = setTimeout(() => {
      const rowHeight = getRowHeight()
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragState({
        taskId,
        startY,
        currentY: startY,
        insertIndex: tasks.findIndex((t) => t.id === taskId),
        rowHeight,
      })
    }, 400)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLLIElement>) {
    if (!dragState) return
    const insertIndex = computeInsertIndex(e.clientY, dragState.taskId)
    setDragState((prev) => prev ? { ...prev, currentY: e.clientY, insertIndex } : null)
  }

  function handlePointerUp(_e: React.PointerEvent<HTMLLIElement>) {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    if (!dragState) return

    const newRank = computeNewRank(tasks, dragState.insertIndex, dragState.taskId)
    const others = tasks.filter((t) => t.id !== dragState.taskId)
    const draggedTask = tasks.find((t) => t.id === dragState.taskId)!
    const updatedDragged = { ...draggedTask, rank: newRank }
    const newTasks = [
      ...others.slice(0, dragState.insertIndex),
      updatedDragged,
      ...others.slice(dragState.insertIndex),
    ]
    setTasks(newTasks)
    setDragState(null)
    updateTaskRank(dragState.taskId, newRank)
  }

  function handlePointerCancel() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    setDragState(null)
  }

  // Compute visual offset for each task row while dragging
  function getTaskTranslateY(task: Task): number {
    if (!dragState || task.id === dragState.taskId) return 0

    const others = tasks.filter((t) => t.id !== dragState.taskId)
    const originalDraggedIndex = tasks.findIndex((t) => t.id === dragState.taskId)
    const taskIndexInOthers = others.findIndex((t) => t.id === task.id)
    const insertIndex = dragState.insertIndex

    // Determine if this task needs to shift to make room for the dragged item
    const rowHeight = dragState.rowHeight

    if (originalDraggedIndex <= taskIndexInOthers) {
      // Dragged item was originally above this task
      // If insert point is at or after this task's position: no shift needed
      // If insert point is before this task's position: shift down
      if (taskIndexInOthers >= insertIndex) {
        return rowHeight
      }
    } else {
      // Dragged item was originally below this task
      // If insert point is at or before this task's position: shift up
      if (taskIndexInOthers < insertIndex) {
        return -rowHeight
      }
    }
    return 0
  }

  const draggedTask = dragState ? tasks.find((t) => t.id === dragState.taskId) : null
  const ghostOffsetY = dragState ? dragState.currentY - dragState.startY : 0

  return (
    <main>
      <ul ref={listRef} style={{ listStyle: 'none', padding: 0, margin: 0, position: 'relative' }}>
        {tasks.map((task) => {
          const isDragged = dragState?.taskId === task.id
          const translateY = getTaskTranslateY(task)

          return (
            <li
              key={task.id}
              ref={(el) => {
                if (el) rowRefsMap.current.set(task.id, el)
                else rowRefsMap.current.delete(task.id)
              }}
              onPointerDown={(e) => handlePointerDown(e, task.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              style={{
                userSelect: 'none',
                touchAction: 'none',
                cursor: dragState ? 'grabbing' : 'grab',
                padding: '12px 16px',
                borderBottom: '1px solid #eee',
                boxSizing: 'border-box',
                opacity: isDragged ? 0 : 1,
                transform: isDragged ? 'none' : `translateY(${translateY}px)`,
                transition: isDragged ? 'none' : 'transform 0.15s ease',
                position: 'relative',
                zIndex: isDragged ? 0 : 1,
              }}
            >
              {task.name}
            </li>
          )
        })}
      </ul>

      {/* Ghost element that follows the pointer */}
      {draggedTask && dragState && (() => {
        const el = rowRefsMap.current.get(draggedTask.id)
        const rect = el?.getBoundingClientRect()
        const top = rect ? rect.top + ghostOffsetY : dragState.currentY
        const left = rect?.left ?? 0
        const width = rect?.width ?? 300

        return (
          <div
            style={{
              position: 'fixed',
              top,
              left,
              width,
              padding: '12px 16px',
              boxSizing: 'border-box',
              borderBottom: '1px solid #eee',
              backgroundColor: 'white',
              opacity: 0.85,
              transform: 'scale(1.05)',
              transformOrigin: 'center center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            {draggedTask.name}
          </div>
        )
      })()}
    </main>
  )
}
