import { useEffect, useState } from 'react'
import { LexoRank } from 'lexorank'
import { loadTasks, updateTaskDone, updateTaskRank, type Task } from './tasks'
import { DraggableList } from './DraggableList'

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

  function handleDoneChange(id: number, done: boolean) {
    updateTaskDone(id, done)
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)))
  }

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

  return (
    <main>
      <DraggableList
        items={tasks}
        onReorder={handleReorder}
        renderItem={(task) => (
          <>
            <input
              type="checkbox"
              checked={task.done}
              onChange={(e) => handleDoneChange(task.id, e.target.checked)}
            />
            <span style={task.done ? { color: '#aaa' } : undefined}>
              {task.name}
            </span>
          </>
        )}
      />
    </main>
  )
}
