import { useCallback, useEffect, useRef, useState } from 'react'
import { loadTasks, loadStatuses, loadViews, loadAllDueTransitions, updateTaskStatus, deleteScheduledTransition, type Task, type Status, type View } from './db'
import MainPage from './MainPage'
import SettingsPage from './SettingsPage'

type Page = 'main' | 'settings'

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [statuses, setStatuses] = useState<Status[]>([])
  const [views, setViews] = useState<View[]>([])
  const [currentViewSlug, setCurrentViewSlug] = useState<string>(
    () => localStorage.getItem('currentViewSlug') ?? ''
  )
  const [recentViewSlugs, setRecentViewSlugs] = useState<string[]>(
    () => {
      try {
        return JSON.parse(localStorage.getItem('recentViewSlugs') ?? '[]')
      } catch { return [] }
    }
  )
  const [page, setPage] = useState<Page>('main')
  const archiveRan = useRef(false)

  useEffect(() => {
    if (tasks.length === 0 || archiveRan.current) return
    archiveRan.current = true
    const slug = localStorage.getItem('auto-archive-status-slug')
    if (!slug) return
    const lastRun = localStorage.getItem('auto-archive-last-run')
    const today = new Date().toDateString()
    if (lastRun === today) return
    localStorage.setItem('auto-archive-last-run', today)
    setTasks(prev => prev.map(t => t.done ? { ...t, statusSlug: slug } : t))
    tasks.filter(t => t.done).forEach(t => updateTaskStatus(t.id, slug))
  }, [tasks])

  const [autoTransitionedTaskIds, setAutoTransitionedTaskIds] = useState<Set<number>>(new Set())

  const tasksRef = useRef<Task[]>(tasks)
  tasksRef.current = tasks

  // Tracks the last calendar day we checked for due transitions, so a tab
  // regaining visibility only re-checks once per day instead of on every focus.
  const lastCheckedDateRef = useRef(getTodayDateString())

  const applyDueTransitions = useCallback(async (currentTasks: Task[]): Promise<Task[]> => {
    const dueTransitions = await loadAllDueTransitions()
    if (dueTransitions.length === 0) return currentTasks

    const transitionedIds = new Set<number>()
    await Promise.all(
      dueTransitions.map(async (transition) => {
        const hasTask = currentTasks.some((t) => t.id === transition.taskId)
        if (hasTask) {
          await updateTaskStatus(transition.taskId, transition.statusSlug)
          await deleteScheduledTransition(transition.id)
          transitionedIds.add(transition.taskId)
        }
      })
    )

    if (transitionedIds.size === 0) return currentTasks

    setAutoTransitionedTaskIds((prev) => new Set([...prev, ...transitionedIds]))
    return currentTasks.map((t) => {
      const transition = dueTransitions.find((tr) => tr.taskId === t.id && transitionedIds.has(tr.taskId))
      return transition ? { ...t, statusSlug: transition.statusSlug } : t
    })
  }, [])

  useEffect(() => {
    let isMounted = true

    async function init() {
      const [loadedTasks, loadedStatuses, loadedViews] = await Promise.all([loadTasks(), loadStatuses(), loadViews()])
      if (!isMounted) return

      const updatedTasks = await applyDueTransitions(loadedTasks)
      if (!isMounted) return

      setTasks(updatedTasks)
      setStatuses(loadedStatuses)
      setViews(loadedViews)

      if (loadedViews.length > 0) {
        const storedSlug = localStorage.getItem('currentViewSlug')
        const validSlug = storedSlug !== null && loadedViews.some((v) => v.slug === storedSlug)
          ? storedSlug
          : loadedViews[0].slug
        setCurrentViewSlug(validSlug)
        if (validSlug !== storedSlug) {
          localStorage.setItem('currentViewSlug', validSlug)
        }

        let storedRecent: string[]
        try { storedRecent = JSON.parse(localStorage.getItem('recentViewSlugs') ?? '[]') }
        catch { storedRecent = [] }
        const validRecent = storedRecent.filter((s) => loadedViews.some((v) => v.slug === s))
        setRecentViewSlugs(validRecent.length > 0 ? validRecent : [validSlug])
      }
    }

    init()

    return () => {
      isMounted = false
    }
  }, [applyDueTransitions])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return

      const today = getTodayDateString()
      if (today === lastCheckedDateRef.current) return
      lastCheckedDateRef.current = today

      applyDueTransitions(tasksRef.current).then(setTasks)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [applyDueTransitions])

  function handleClearAutoTransitionIndicator(id: number) {
    setAutoTransitionedTaskIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

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
      autoTransitionedTaskIds={autoTransitionedTaskIds}
      onClearAutoTransitionIndicator={handleClearAutoTransitionIndicator}
    />
  )
}
