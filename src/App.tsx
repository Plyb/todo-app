import { useEffect, useState } from 'react'
import { loadTasks, updateTaskDone, type Task } from './tasks'

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

  return (
    <main>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <input
              type="checkbox"
              checked={task.done}
              onChange={(e) => handleDoneChange(task.id, e.target.checked)}
            />
            <span style={task.done ? { textDecoration: 'line-through' } : undefined}>
              {task.name}
            </span>
          </li>
        ))}
      </ul>
    </main>
  )
}
