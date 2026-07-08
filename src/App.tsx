import { useEffect, useState } from 'react'
import { loadTasks, type Task } from './tasks'
import MainPage from './MainPage'
import SettingsPage from './SettingsPage'

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
    return <SettingsPage onBack={() => setPage('main')} />
  }

  return <MainPage tasks={tasks} onNavigateToSettings={() => setPage('settings')} />
}
