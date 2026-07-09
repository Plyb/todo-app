import { useEffect, useRef, useState } from 'react'
import { loadTasks, loadStatuses, updateTaskStatus, type Task, type Status } from './tasks'
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
  const archiveRan = useRef(false)

  useEffect(() => {
    if (tasks.length === 0 || archiveRan.current) return
    archiveRan.current = true
    const slug = localStorage.getItem('auto-archive-status-slug') ?? 'none'
    if (slug === 'none') return
    const lastRun = localStorage.getItem('auto-archive-last-run')
    const today = new Date().toDateString()
    if (lastRun === today) return
    localStorage.setItem('auto-archive-last-run', today)
    setTasks(prev => prev.map(t => t.done ? { ...t, statusSlug: slug } : t))
    tasks.filter(t => t.done).forEach(t => updateTaskStatus(t.id, slug))
  }, [tasks])

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
    return <SettingsPage onBack={() => setPage('main')} statuses={statuses} />
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
