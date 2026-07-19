import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import * as db from './db'
import type { Task, Status, View, UserDefinedView } from './types'
import type { StatusUsage } from './db'
import { byRank, rankAtInsertIndex } from './rank-utils'
import { isArchiveEligible } from './archive-utils'
import { ARCHIVE_VIEW } from './synthetic-view-utils'
import { needsRerank, rerankStatusGroup } from './rerank-utils'
import { readCurrentViewSlug, writeCurrentViewSlug, readRecentViewSlugs, writeRecentViewSlugs, getAutoArchiveEnabled } from './storage'
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
  const dailyScanDateRef = useRef<string | null>(null)

  useEffect(() => {
    if (tasks.length === 0) return

    const today = getTodayDateString()
    if (dailyScanDateRef.current === today) return
    dailyScanDateRef.current = today

    if (getAutoArchiveEnabled()) {
      const toArchive = tasks.filter(t => t.archivedAt === null && isArchiveEligible(t, today))
      if (toArchive.length > 0) {
        const toArchiveIds = new Set(toArchive.map(t => t.id))
        setTasks(prev => prev.map(t => toArchiveIds.has(t.id) ? { ...t, archivedAt: today } : t))
        toArchive.forEach(t => db.updateTaskArchivedAt(t.id, today))
      }
    }

    const statusSlugs = Array.from(new Set(tasks.map(t => t.statusSlug)))
    const rerankUpdates = statusSlugs.flatMap(statusSlug => {
      const group = tasks.filter(t => t.statusSlug === statusSlug)
      return needsRerank(group) ? rerankStatusGroup(group) : []
    })
    if (rerankUpdates.length > 0) {
      const rankById = new Map(rerankUpdates.map(u => [u.id, u.rank]))
      setTasks(prev => prev.map(t => rankById.has(t.id) ? { ...t, rank: rankById.get(t.id)! } : t))
      rerankUpdates.forEach(u => db.updateTaskRank(u.id, u.rank))
    }
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

      // The archive view is a UI-layer construct, not a persisted one - it's
      // appended here (after the real views, so it's never the default) so
      // every other consumer of `views` just sees it as a normal member,
      // rather than each having to special-case a separate sentinel slug.
      const viewsWithArchive: View[] = [...loadedViews, ARCHIVE_VIEW]

      setTasks(updatedTasks)
      setStatuses(loadedStatuses)
      setViews(viewsWithArchive)

      const storedSlug = readCurrentViewSlug()
      const validSlug = storedSlug !== null && viewsWithArchive.some((v) => v.slug === storedSlug)
        ? storedSlug
        : viewsWithArchive[0].slug
      setCurrentViewSlug(validSlug)
      if (validSlug !== storedSlug) {
        writeCurrentViewSlug(validSlug)
      }

      const storedRecent = readRecentViewSlugs()
      const validRecent = storedRecent.filter((s) => viewsWithArchive.some((v) => v.slug === s))
      setRecentViewSlugs(validRecent.length > 0 ? validRecent : [validSlug])
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
    setViews([...newViews, ARCHIVE_VIEW])
  }

  // Refetch (not roll back) on write failure: rolling back to a stale snapshot could erase a concurrently-succeeded edit.
  async function refetchTasks(): Promise<void> {
    setTasks(await db.loadTasks())
  }

  function setDone(id: number, done: boolean): void {
    const completedAt = done ? getTodayDateString() : null
    db.updateTaskCompletedAt(id, completedAt).catch(() => refetchTasks())
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completedAt } : t))
  }

  function setArchived(id: number, archived: boolean): void {
    const archivedAt = archived ? getTodayDateString() : null
    db.updateTaskArchivedAt(id, archivedAt).catch(() => refetchTasks())
    setTasks(prev => prev.map(t => t.id === id ? { ...t, archivedAt } : t))
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
    // Appends to the end of the destination status so the task can't collide
    // with the rank of a task already sitting there.
    const destTasks = tasks.filter(t => t.statusSlug === statusSlug)
    const newRank = rankAtInsertIndex(destTasks, destTasks.length, id)
    try {
      await db.updateTaskStatus(id, statusSlug)
      await db.updateTaskRank(id, newRank)
      setTasks(prev => {
        const updated = prev.map(t => t.id === id ? { ...t, statusSlug, rank: newRank } : t)
        return updated.sort(byRank)
      })
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

  function setActiveViewSlug(slug: string): void {
    setCurrentViewSlug(slug)
    writeCurrentViewSlug(slug)
  }

  function openView(slug: string): void {
    setActiveViewSlug(slug)
    setRecentViewSlugs((prev) => {
      const next = [slug, ...prev.filter((s) => s !== slug)]
      writeRecentViewSlugs(next)
      return next
    })
  }

  async function saveView(view: UserDefinedView): Promise<void> {
    await db.saveView(view)
    setViews(prev => prev.some(v => v.slug === view.slug)
      ? prev.map(v => v.slug === view.slug ? view : v)
      : [...prev, view])
  }

  async function deleteView(slug: string): Promise<void> {
    await db.deleteView(slug)

    const remainingViews = views.filter(v => v.slug !== slug)
    setViews(remainingViews)

    const prunedRecent = recentViewSlugs.filter((s) => s !== slug && remainingViews.some((v) => v.slug === s))
    writeRecentViewSlugs(prunedRecent)
    setRecentViewSlugs(prunedRecent)

    if (slug === currentViewSlug) {
      setActiveViewSlug(prunedRecent[0] ?? remainingViews[0].slug)
    }
  }

  const value: TasksContextValue = {
    tasks,
    statuses,
    views,
    currentViewSlug,
    recentViewSlugs,
    autoTransitionedTaskIds,
    setDone,
    setArchived,
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
