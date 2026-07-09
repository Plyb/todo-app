import { useEffect, useState } from 'react'
import { loadTasks, loadStatuses, loadAllDueTransitions, updateTaskStatus, deleteScheduledTransition, type Task, type Status } from './tasks'
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
  const [autoTransitionedTaskIds, setAutoTransitionedTaskIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    let isMounted = true

    async function init() {
      const [[loadedTasks, loadedStatuses], dueTransitions] = await Promise.all([
        Promise.all([loadTasks(), loadStatuses()]),
        loadAllDueTransitions(),
      ])
      if (!isMounted) return

      const transitionedIds = new Set<number>()
      await Promise.all(
        dueTransitions.map(async (transition) => {
          const hasTask = loadedTasks.some((t) => t.id === transition.taskId)
          if (hasTask) {
            await updateTaskStatus(transition.taskId, transition.statusSlug)
            await deleteScheduledTransition(transition.id)
            transitionedIds.add(transition.taskId)
          }
        })
      )

      const updatedTasks = loadedTasks.map((t) => {
        const transition = dueTransitions.find((tr) => tr.taskId === t.id)
        return transition ? { ...t, statusSlug: transition.statusSlug } : t
      })

      if (isMounted) {
        setTasks(updatedTasks)
        setStatuses(loadedStatuses)
        setAutoTransitionedTaskIds(transitionedIds)
      }
    }

    init()

    return () => {
      isMounted = false
    }
  }, [])

  function handleClearAutoTransitionIndicator(id: number) {
    setAutoTransitionedTaskIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

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
      autoTransitionedTaskIds={autoTransitionedTaskIds}
      onClearAutoTransitionIndicator={handleClearAutoTransitionIndicator}
    />
  )
}
