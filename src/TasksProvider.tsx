import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import * as db from './db'
import type { Task, Status, View, UserDefinedView } from './types'
import type { StatusUsage } from './db'
import { byRank, rankAtInsertIndex } from './rank-utils'
import { isArchiveEligible } from './archive-utils'
import { ARCHIVE_VIEW, ARCHIVE_VIEW_ID } from './synthetic-view-utils'
import { needsRerank, rerankStatusGroup } from './rerank-utils'
import { readCurrentViewId, writeCurrentViewId, readRecentViewIds, writeRecentViewIds, getAutoArchiveEnabled } from './storage'
import { TasksContext, type TasksContextValue } from './tasks-context'
import { DEFAULT_SECTION_PAGING, type SectionPagingInfo } from './view-utils'

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

// Adds tasks the caller doesn't already hold, without disturbing any that are
// already in memory (e.g. an in-flight optimistic edit for an id also present
// in a freshly-fetched page).
function mergeTasks(existing: Task[], fetched: Task[]): Task[] {
  const knownIds = new Set(existing.map((t) => t.id))
  const additions = fetched.filter((t) => !knownIds.has(t.id))
  return additions.length > 0 ? [...existing, ...additions] : existing
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [statuses, setStatuses] = useState<Status[]>([])
  const [views, setViews] = useState<View[]>([])
  const [sectionPaging, setSectionPaging] = useState<Record<string, SectionPagingInfo>>({})
  const sectionPagingRef = useRef(sectionPaging)
  sectionPagingRef.current = sectionPaging
  const [currentViewId, setCurrentViewId] = useState<string>(
    () => readCurrentViewId() ?? ''
  )
  const [recentViewIds, setRecentViewIds] = useState<string[]>(
    () => readRecentViewIds()
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

    const existingTasks = await db.loadTasksByIds(dueTransitions.map((t) => t.taskId))
    const existingIds = new Set(existingTasks.map((t) => t.id))

    const transitionedIds = new Set<number>()
    await Promise.all(
      dueTransitions
        .filter((transition) => existingIds.has(transition.taskId))
        .map(async (transition) => {
          await db.updateTaskStatus(transition.taskId, transition.statusSlug)
          await db.deleteScheduledTransition(transition.id)
          transitionedIds.add(transition.taskId)
        })
    )

    if (transitionedIds.size === 0) return currentTasks

    setAutoTransitionedTaskIds((prev) => new Set([...prev, ...transitionedIds]))
    // Tasks not already in currentTasks pick up their new statusSlug from the
    // db directly once they're paginated in, so only in-memory tasks need patching here.
    return currentTasks.map((t) => {
      const transition = dueTransitions.find((tr) => tr.taskId === t.id && transitionedIds.has(tr.taskId))
      return transition ? { ...t, statusSlug: transition.statusSlug } : t
    })
  }, [])

  useEffect(() => {
    let isMounted = true

    async function init() {
      const [loadedStatuses, loadedViews] = await Promise.all([db.loadStatuses(), db.loadViews()])
      if (!isMounted) return

      const updatedTasks = await applyDueTransitions([])
      if (!isMounted) return

      // The archive view is a UI-layer construct, not a persisted one - it's
      // appended here (after the real views, so it's never the default) so
      // every other consumer of `views` just sees it as a normal member,
      // rather than each having to special-case a separate sentinel id.
      const viewsWithArchive: View[] = [...loadedViews, ARCHIVE_VIEW]

      setTasks(updatedTasks)
      setStatuses(loadedStatuses)
      setViews(viewsWithArchive)

      const storedId = readCurrentViewId()
      const validId = storedId !== null && viewsWithArchive.some((v) => v.id === storedId)
        ? storedId
        : viewsWithArchive[0].id
      setCurrentViewId(validId)
      if (validId !== storedId) {
        writeCurrentViewId(validId)
      }

      const storedRecent = readRecentViewIds()
      const validRecent = storedRecent.filter((s) => viewsWithArchive.some((v) => v.id === s))
      setRecentViewIds(validRecent.length > 0 ? validRecent : [validId])
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
    const [newStatuses, newTasks, newViews] = await Promise.all([
      db.loadStatuses(),
      db.loadTasksByIds(tasks.map((t) => t.id)),
      db.loadViews(),
    ])
    setStatuses(newStatuses)
    setTasks(newTasks)
    setViews([...newViews, ARCHIVE_VIEW])
  }

  // Refetch (not roll back) on write failure: rolling back to a stale snapshot could erase a concurrently-succeeded edit.
  async function refetchTasks(): Promise<void> {
    setTasks(await db.loadTasksByIds(tasks.map((t) => t.id)))
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

  function setActiveViewId(id: string): void {
    setCurrentViewId(id)
    writeCurrentViewId(id)
  }

  function openView(id: string): void {
    setActiveViewId(id)
    setRecentViewIds((prev) => {
      const next = [id, ...prev.filter((s) => s !== id)]
      writeRecentViewIds(next)
      return next
    })
  }

  async function saveView(view: UserDefinedView): Promise<void> {
    await db.saveView(view)
    setViews(prev => prev.some(v => v.id === view.id)
      ? prev.map(v => v.id === view.id ? view : v)
      : [...prev, view])
  }

  async function deleteView(id: string): Promise<void> {
    await db.deleteView(id)

    const remainingViews = views.filter(v => v.id !== id)
    setViews(remainingViews)

    const prunedRecent = recentViewIds.filter((s) => s !== id && remainingViews.some((v) => v.id === s))
    writeRecentViewIds(prunedRecent)
    setRecentViewIds(prunedRecent)

    if (id === currentViewId) {
      setActiveViewId(prunedRecent[0] ?? remainingViews[0].id)
    }
  }

  /**
   * 
   * @param sectionKey either a section slug or a synthetic view id (such as __archive__)
   * @returns 
   */
  function requestTaskPage(sectionKey: string): void {
    const current = sectionPagingRef.current[sectionKey] ?? DEFAULT_SECTION_PAGING
    if (current.isLoading || !current.hasMore) return

    setSectionPaging(prev => ({ ...prev, [sectionKey]: { ...current, isLoading: true } }))

    const pageRequest = sectionKey === ARCHIVE_VIEW_ID
      ? db.loadArchivedTaskPage(current.offset)
      : db.loadTaskPageForStatus(sectionKey, current.offset)

    pageRequest
      .then((page) => {
        setTasks(prev => mergeTasks(prev, page.tasks))
        setSectionPaging(prev => ({
          ...prev,
          [sectionKey]: { offset: current.offset + page.tasks.length, isLoading: false, hasMore: page.hasMore },
        }))
      })
      .catch(() => {
        setSectionPaging(prev => ({ ...prev, [sectionKey]: { ...current, isLoading: false } }))
      })
  }

  const value: TasksContextValue = {
    tasks,
    statuses,
    views,
    currentViewId,
    recentViewIds,
    autoTransitionedTaskIds,
    sectionPaging,
    requestTaskPage,
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
