import { useEffect, useState } from 'react'
import { loadTasks, type Task } from './tasks'

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

  return (
    <main>
      <h1>Tasks</h1>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>{task.name}</li>
        ))}
      </ul>
    </main>
  )
}
