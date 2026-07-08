import { useEffect, useState } from 'react'
import { loadTasks, loadStatuses, type Task, type Status } from './tasks'
import MainPage from './MainPage'
import SettingsPage from './SettingsPage'

type Page = 'main' | 'settings'

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [statuses, setStatuses] = useState<Status[]>([])
  const [currentStatusSlug, setCurrentStatusSlug] = useState(
    () => localStorage.getItem('currentStatusSlug') ?? 'today'
  )
  const [recentStatusSlugs, setRecentStatusSlugs] = useState<string[]>(
    () => {
      try {
        return JSON.parse(localStorage.getItem('recentStatusSlugs') ?? '["today"]')
      } catch { return ['today'] }
    }
  )
  const [page, setPage] = useState<Page>('main')

  useEffect(() => {
    let isMounted = true

    Promise.all([loadTasks(), loadStatuses()]).then(([loadedTasks, loadedStatuses]) => {
      if (isMounted) {
        setTasks(loadedTasks)
        setStatuses(loadedStatuses)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  function openStatus(slug: string) {
    setCurrentStatusSlug(slug)
    localStorage.setItem('currentStatusSlug', slug)
    setRecentStatusSlugs((prev) => {
      const next = [slug, ...prev.filter((s) => s !== slug)]
      localStorage.setItem('recentStatusSlugs', JSON.stringify(next))
      return next
    })
  }

  if (page === 'settings') {
    return <SettingsPage onBack={() => setPage('main')} />
  }

  return (
    <MainPage
      tasks={tasks}
      setTasks={setTasks}
      statuses={statuses}
      currentStatusSlug={currentStatusSlug}
      recentStatusSlugs={recentStatusSlugs}
      onOpenStatus={openStatus}
      onNavigateToSettings={() => setPage('settings')}
    />
  )
}
