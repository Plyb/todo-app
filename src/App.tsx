import { useEffect, useState } from 'react'
import { loadTasks, loadStatuses, loadViews, type Task, type Status, type View } from './tasks'
import MainPage from './MainPage'
import SettingsPage from './SettingsPage'

type Page = 'main' | 'settings'
type Selection = { type: 'status'; slug: string } | { type: 'view'; id: string }

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [statuses, setStatuses] = useState<Status[]>([])
  const [views, setViews] = useState<View[]>([])
  const [currentSelection, setCurrentSelection] = useState<Selection>(() => {
    const saved = localStorage.getItem('currentSelection')
    if (saved) {
      try { return JSON.parse(saved) as Selection } catch { /* fall through */ }
    }
    const slug = localStorage.getItem('currentStatusSlug') ?? 'today'
    return { type: 'status', slug }
  })
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

    Promise.all([loadTasks(), loadStatuses(), loadViews()]).then(([loadedTasks, loadedStatuses, loadedViews]) => {
      if (isMounted) {
        setTasks(loadedTasks)
        setStatuses(loadedStatuses)
        setViews(loadedViews)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  function openSelection(sel: Selection) {
    setCurrentSelection(sel)
    localStorage.setItem('currentSelection', JSON.stringify(sel))
    if (sel.type === 'status') {
      setRecentStatusSlugs((prev) => {
        const next = [sel.slug, ...prev.filter((s) => s !== sel.slug)]
        localStorage.setItem('recentStatusSlugs', JSON.stringify(next))
        return next
      })
    }
  }

  async function handleViewsChange(newViews: View[]) {
    setViews(newViews)
  }

  const currentView = currentSelection.type === 'view'
    ? views.find((v) => v.id === currentSelection.id)
    : undefined

  const currentStatusSlug = currentSelection.type === 'status'
    ? currentSelection.slug
    : (currentView?.statusSlugs[0] ?? statuses[0]?.slug ?? 'today')

  if (page === 'settings') {
    return (
      <SettingsPage
        onBack={() => setPage('main')}
        statuses={statuses}
        views={views}
        onViewsChange={handleViewsChange}
      />
    )
  }

  return (
    <MainPage
      tasks={tasks}
      setTasks={setTasks}
      statuses={statuses}
      views={views}
      currentStatusSlug={currentStatusSlug}
      currentView={currentView}
      recentStatusSlugs={recentStatusSlugs}
      onOpenStatus={(slug) => openSelection({ type: 'status', slug })}
      onOpenView={(id) => openSelection({ type: 'view', id })}
      onNavigateToSettings={() => setPage('settings')}
    />
  )
}
