import { useEffect, useState } from 'react'
import { loadTasks, type Task } from './tasks'

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)

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

  function handleTaskClick(event: React.MouseEvent, taskId: number) {
    if ((event.target as HTMLElement).closest('input[type="checkbox"]')) return
    setSelectedTaskId((prev) => (prev === taskId ? null : taskId))
  }

  return (
    <main>
      <ul>
        {tasks.map((task) => {
          const isSelected = task.id === selectedTaskId
          const isFaded = selectedTaskId !== null && !isSelected
          return (
            <li
              key={task.id}
              onClick={(e) => handleTaskClick(e, task.id)}
              style={{
                opacity: isFaded ? 0.4 : 1,
                backgroundColor: isSelected ? '#e8f0fe' : 'transparent',
                paddingTop: isSelected ? '12px' : '4px',
                paddingBottom: isSelected ? '12px' : '4px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {task.name}
            </li>
          )
        })}
      </ul>
    </main>
  )
}
