import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import * as db from './db'
import type { Task, Status, View } from './types'
import type { StatusUsage } from './db'
import { byRank } from './rank-utils'
import { readCurrentViewSlug, writeCurrentViewSlug, readRecentViewSlugs, writeRecentViewSlugs } from './storage'
import { TasksContext, type TasksContextValue } from './tasks-context'

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [statuses, setStatuses] = useState<Status[]>([])
  const [views, setViews] = useState<View[]>([])
  const [currentViewSlug, setCurrentViewSlug] = useState<string>(
    () => readCurrentViewSlug() ?? ''
  )
  const [recentViewSlugs, setRecentViewSlugs] = useState<string[]>(
    () => readRecentViewSlugs()
  )
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
    tasks.filter(t => t.done).forEach(t => db.updateTaskStatus(t.id, slug))
  }, [tasks])

  const [autoTransitionedTaskIds, setAutoTransitionedTaskIds] = useState<Set<number>>(new Set())

  // Tracks the last calendar day we checked for due transitions, so a tab
  // regaining visibility only re-checks once per day instead of on every focus.
  const lastCheckedDateRef = useRef(getTodayDateString())

  const applyDueTransitions = useCallback(async (currentTasks: Task[]): Promise<Task[]> => {
    const dueTransitions = await db.loadAllDueTransitions()
    if (dueTransitions.length === 0) return currentTasks

    const transitionedIds = new Set<number>()
    await Promise.all(
      dueTransitions.map(async (transition) => {
        const hasTask = currentTasks.some((t) => t.id === transition.taskId)
        if (hasTask) {
          await db.updateTaskStatus(transition.taskId, transition.statusSlug)
          await db.deleteScheduledTransition(transition.id)
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
      const [loadedTasks, loadedStatuses, loadedViews] = await Promise.all([db.loadTasks(), db.loadStatuses(), db.loadViews()])
      if (!isMounted) return

      const updatedTasks = await applyDueTransitions(loadedTasks)
      if (!isMounted) return

      setTasks(updatedTasks)
      setStatuses(loadedStatuses)
      setViews(loadedViews)

      if (loadedViews.length > 0) {
        const storedSlug = readCurrentViewSlug()
        const validSlug = storedSlug !== null && loadedViews.some((v) => v.slug === storedSlug)
          ? storedSlug
          : loadedViews[0].slug
        setCurrentViewSlug(validSlug)
        if (validSlug !== storedSlug) {
          writeCurrentViewSlug(validSlug)
        }

        const storedRecent = readRecentViewSlugs()
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

      applyDueTransitions(tasks).then(setTasks)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [applyDueTransitions, tasks])

  async function refetchAll(): Promise<void> {
    const [newStatuses, newTasks, newViews] = await Promise.all([db.loadStatuses(), db.loadTasks(), db.loadViews()])
    setStatuses(newStatuses)
    setTasks(newTasks)
    setViews(newViews)
  }

  // Refetch (not roll back) on write failure: rolling back to a stale snapshot could erase a concurrently-succeeded edit.
  async function refetchTasks(): Promise<void> {
    setTasks(await db.loadTasks())
  }

  function setDone(id: number, done: boolean): void {
    db.updateTaskDone(id, done).catch(() => refetchTasks())
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done } : t))
  }

  function moveTask(id: number, toStatusSlug: string, newRank: string, changeStatus: boolean): void {
    if (changeStatus) db.updateTaskStatus(id, toStatusSlug).catch(() => refetchTasks())
    db.updateTaskRank(id, newRank).catch(() => refetchTasks())
    setTasks(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, rank: newRank, statusSlug: toStatusSlug } : t)
      return updated.sort(byRank)
    })
  }

  async function setStatus(id: number, statusSlug: string): Promise<void> {
    try {
      await db.updateTaskStatus(id, statusSlug)
      setTasks(prev => prev.map(t => t.id === id ? { ...t, statusSlug } : t))
    } catch {
      await refetchTasks()
    }
  }

  function renameTask(id: number, name: string): void {
    db.updateTaskName(id, name).catch(() => refetchTasks())
    setTasks(prev => prev.map(t => t.id === id ? { ...t, name } : t))
  }

  function updateNotes(id: number, notes: string): void {
    db.updateTaskNotes(id, notes).catch(() => refetchTasks())
    setTasks(prev => prev.map(t => t.id === id ? { ...t, notes } : t))
  }

  async function deleteTask(id: number): Promise<void> {
    try {
      await db.deleteTask(id)
      setTasks(prev => prev.filter(t => t.id !== id))
    } catch {
      await refetchTasks()
    }
  }

  async function createTask(name: string, rank: string, statusSlug: string): Promise<Task> {
    try {
      const task = await db.createTask(name, rank, statusSlug)
      setTasks(prev => [...prev, task].sort(byRank))
      return task
    } catch (err) {
      await refetchTasks()
      throw err
    }
  }

  function clearAutoTransitionIndicator(id: number): void {
    setAutoTransitionedTaskIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function createStatus(name: string, slug: string): Promise<void> {
    await db.createStatus(name, slug)
    await refetchAll()
  }

  async function updateStatus(oldSlug: string, newSlug: string, name: string): Promise<void> {
    await db.updateStatus(oldSlug, newSlug, name)
    await refetchAll()
  }

  async function deleteStatus(slug: string): Promise<void> {
    await db.deleteStatus(slug)
    await refetchAll()
  }

  async function reassignAndDeleteStatus(fromSlug: string, toSlug: string): Promise<void> {
    await db.reassignStatus(fromSlug, toSlug)
    await db.deleteStatus(fromSlug)
    await refetchAll()
  }

  function getStatusUsage(slug: string): Promise<StatusUsage> {
    return db.getStatusUsage(slug)
  }

  function openView(slug: string): void {
    setCurrentViewSlug(slug)
    writeCurrentViewSlug(slug)
    setRecentViewSlugs((prev) => {
      const next = [slug, ...prev.filter((s) => s !== slug)]
      writeRecentViewSlugs(next)
      return next
    })
  }

  async function saveView(view: View): Promise<void> {
    await db.saveView(view)
    setViews(prev => prev.some(v => v.slug === view.slug)
      ? prev.map(v => v.slug === view.slug ? view : v)
      : [...prev, view])
  }

  async function deleteView(slug: string): Promise<void> {
    await db.deleteView(slug)
    setViews(prev => prev.filter(v => v.slug !== slug))
  }

  const value: TasksContextValue = {
    tasks,
    statuses,
    views,
    currentViewSlug,
    recentViewSlugs,
    autoTransitionedTaskIds,
    setDone,
    moveTask,
    setStatus,
    renameTask,
    updateNotes,
    deleteTask,
    createTask,
    clearAutoTransitionIndicator,
    createStatus,
    updateStatus,
    deleteStatus,
    reassignAndDeleteStatus,
    getStatusUsage,
    openView,
    saveView,
    deleteView,
  }

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}
