import { useEffect, useState } from 'react'
import { loadTasks, type Task } from './tasks'

type Page = 'main' | 'settings'

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [page, setPage] = useState<Page>('main')

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

  if (page === 'settings') {
    return (
      <main>
        <button
          onClick={() => setPage('main')}
          style={{ position: 'fixed', top: 16, left: 16 }}
        >
          ← Back
        </button>
      </main>
    )
  }

  return (
    <main>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>{task.name}</li>
        ))}
      </ul>
      <button
        onClick={() => setPage('settings')}
        style={{ position: 'fixed', bottom: 16, left: 16 }}
      >
        ⚙ Settings
      </button>
    </main>
  )
}
