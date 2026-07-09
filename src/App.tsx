import { useEffect, useState } from 'react'
import { loadTasks, loadStatuses, loadViews, saveView, type Task, type Status, type View } from './db'
import MainPage from './MainPage'
import SettingsPage from './SettingsPage'

type Page = 'main' | 'settings'

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [statuses, setStatuses] = useState<Status[]>([])
  const [views, setViews] = useState<View[]>([])
  const [currentViewSlug, setCurrentViewSlug] = useState<string>(
    () => localStorage.getItem('currentViewSlug') ?? 'today'
  )
  const [recentViewSlugs, setRecentViewSlugs] = useState<string[]>(
    () => {
      try {
        return JSON.parse(localStorage.getItem('recentViewSlugs') ?? '["today"]')
      } catch { return ['today'] }
    }
  )
  const [page, setPage] = useState<Page>('main')

  useEffect(() => {
    let isMounted = true

    Promise.all([loadTasks(), loadStatuses(), loadViews()]).then(async ([loadedTasks, loadedStatuses, loadedViews]) => {
      if (!isMounted) return

      const viewsToSave: View[] = []
      for (const status of loadedStatuses) {
        if (!loadedViews.some((v) => v.slug === status.slug)) {
          const defaultView: View = {
            id: crypto.randomUUID(),
            slug: status.slug,
            name: status.name,
            statusSlugs: [status.slug],
          }
          viewsToSave.push(defaultView)
        }
      }

      for (const view of viewsToSave) {
        await saveView(view)
      }

      const allViews = [...loadedViews, ...viewsToSave]
      setTasks(loadedTasks)
      setStatuses(loadedStatuses)
      setViews(allViews)
    })

    return () => {
      isMounted = false
    }
  }, [])

  function openView(slug: string) {
    setCurrentViewSlug(slug)
    localStorage.setItem('currentViewSlug', slug)
    setRecentViewSlugs((prev) => {
      const next = [slug, ...prev.filter((s) => s !== slug)]
      localStorage.setItem('recentViewSlugs', JSON.stringify(next))
      return next
    })
  }

  async function handleViewsChange(newViews: View[]) {
    setViews(newViews)
  }

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
      currentViewSlug={currentViewSlug}
      recentViewSlugs={recentViewSlugs}
      onOpenView={openView}
      onNavigateToSettings={() => setPage('settings')}
    />
  )
}
