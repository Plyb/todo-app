import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as db from './db'
import type { Task, Status, View, UserDefinedView } from './types'
import type { StatusUsage } from './db'
import {
  DEFAULT_SOURCE_CONFIG,
  buildSource,
  buildSourceRegistry,
  loadSourceConfigurations,
  type TaskSource,
} from './sources'
import { groupBySourceId, loadAcrossSources, sourceOf } from './sources/source-utils'
import { byRank, rankAtInsertIndex } from './rank-utils'
import { isArchiveEligible } from './archive-utils'
import { ARCHIVE_VIEW, ARCHIVE_VIEW_ID } from './synthetic-view-utils'
import { needsRerank, rerankStatusGroup } from './rerank-utils'
import { readCurrentViewId, writeCurrentViewId, readRecentViewIds, writeRecentViewIds, getAutoArchiveEnabled, readSelectedSourceId } from './storage'
import { TasksContext, type TasksContextValue } from './tasks-context'
import { DEFAULT_SECTION_PAGING, sectionPagingKey, type SectionPagingInfo, type SectionRef } from './view-utils'

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

  const defaultSource = useMemo(() => buildSource(DEFAULT_SOURCE_CONFIG), [])
  const [allSources, setAllSources] = useState<TaskSource[]>([defaultSource])
  const sourceRegistryRef = useRef<Map<string, TaskSource>>(new Map([[defaultSource.id, defaultSource]]))
  const getSource = useCallback(
    (id: string): TaskSource => sourceRegistryRef.current.get(id) ?? defaultSource,
    [defaultSource],
  )
  const getStatusSource = useCallback(
    (slug: string): TaskSource => {
      const status = statuses.find((s) => s.slug === slug)
      return status ? getSource(status.sourceId) : defaultSource
    },
    [statuses, getSource, defaultSource],
  )

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
        toArchive.forEach(t => sourceOf(t, getSource).updateTaskArchivedAt(t.id, today))
      }
    }

    const statusSlugs = Array.from(new Set(tasks.map(t => t.statusSlug)))
    const rerankUpdates = statusSlugs.flatMap(statusSlug => {
      const group = tasks.filter(t => t.statusSlug === statusSlug)
      return needsRerank(group) ? rerankStatusGroup(group) : []
    })
    if (rerankUpdates.length > 0) {
      const rankById = new Map(rerankUpdates.map(u => [u.id, u.rank]))
      const taskById = new Map(tasks.map(t => [t.id, t]))
      setTasks(prev => prev.map(t => rankById.has(t.id) ? { ...t, rank: rankById.get(t.id)! } : t))
      rerankUpdates.forEach(u => {
        const task = taskById.get(u.id)
        if (task) sourceOf(task, getSource).updateTaskRank(u.id, u.rank)
      })
    }
  }, [tasks, getSource])

  const [autoTransitionedTaskIds, setAutoTransitionedTaskIds] = useState<Set<number>>(new Set())

  // Tracks the last calendar day we checked for due transitions, so a tab
  // regaining visibility only re-checks once per day instead of on every focus.
  const lastCheckedDateRef = useRef(getTodayDateString())

  const applyDueTransitions = useCallback(async (currentTasks: Task[]): Promise<Task[]> => {
    const sources = Array.from(sourceRegistryRef.current.values())
    const dueTransitions = await loadAcrossSources(sources, (s) => s.loadAllDueTransitions())
    if (dueTransitions.length === 0) return currentTasks

    const transitionsBySource = groupBySourceId(dueTransitions)
    const existingTasks = (
      await Promise.all(
        Array.from(transitionsBySource.entries()).map(([sourceId, transitions]) =>
          getSource(sourceId).loadTasksByIds(transitions.map((t) => t.taskId)),
        ),
      )
    ).flat()
    const existingIds = new Set(existingTasks.map((t) => t.id))

    const transitionedIds = new Set<number>()
    await Promise.all(
      dueTransitions
        .filter((transition) => existingIds.has(transition.taskId))
        .map(async (transition) => {
          const source = sourceOf(transition, getSource)
          await source.updateTaskStatus(transition.taskId, transition.statusSlug)
          await source.deleteScheduledTransition(transition.id)
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
  }, [getSource])

  useEffect(() => {
    let isMounted = true

    async function init() {
      const [loadedViews, configs] = await Promise.all([
        db.loadViews(),
        loadSourceConfigurations(),
      ])
      if (!isMounted) return

      sourceRegistryRef.current = buildSourceRegistry(configs)
      const sources = Array.from(sourceRegistryRef.current.values())
      setAllSources(sources)

      const loadedStatuses = await loadAcrossSources(sources, (s) => s.loadStatuses())
      if (!isMounted) return

      const updatedTasks = await applyDueTransitions([])
      if (!isMounted) return

      // The archive view is a UI-layer construct, not a persisted one - it's
      // appended here (after the real views, so it's never the default) so
      // every other consumer of `views` just sees it as a normal member,
      // rather than each having to special-case a separate sentinel id.
      const viewsWithArchive: View[] = [...loadedViews, ARCHIVE_VIEW]

      // Merge rather than overwrite: loading statuses from every source added
      // an extra await before this resolves, giving a section page requested
      // right after mount (see requestTaskPage) a real chance to land first.
      setTasks(prev => mergeTasks(prev, updatedTasks))
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

  function loadTasksBySourceGroups(): Promise<Task[]> {
    const tasksBySource = groupBySourceId(tasks)
    return Promise.all(
      Array.from(tasksBySource.entries()).map(([sourceId, ts]) => getSource(sourceId).loadTasksByIds(ts.map((t) => t.id))),
    ).then((results) => results.flat())
  }

  async function refetchAll(): Promise<void> {
    const sources = Array.from(sourceRegistryRef.current.values())
    const [newStatuses, newTasks, newViews] = await Promise.all([
      loadAcrossSources(sources, (s) => s.loadStatuses()),
      loadTasksBySourceGroups(),
      db.loadViews(),
    ])
    setStatuses(newStatuses)
    setTasks(newTasks)
    setViews([...newViews, ARCHIVE_VIEW])
  }

  // Refetch (not roll back) on write failure: rolling back to a stale snapshot could erase a concurrently-succeeded edit.
  async function refetchTasks(): Promise<void> {
    setTasks(await loadTasksBySourceGroups())
  }

  function setDone(id: number, done: boolean): void {
    const completedAt = done ? getTodayDateString() : null
    const task = tasks.find(t => t.id === id)
    if (task) sourceOf(task, getSource).updateTaskCompletedAt(id, completedAt).catch(() => refetchTasks())
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completedAt } : t))
  }

  function setArchived(id: number, archived: boolean): void {
    const archivedAt = archived ? getTodayDateString() : null
    const task = tasks.find(t => t.id === id)
    if (task) sourceOf(task, getSource).updateTaskArchivedAt(id, archivedAt).catch(() => refetchTasks())
    setTasks(prev => prev.map(t => t.id === id ? { ...t, archivedAt } : t))
  }

  function moveTask(id: number, toStatusSlug: string, newRank: string, changeStatus: boolean): void {
    const task = tasks.find(t => t.id === id)
    if (task) {
      const source = sourceOf(task, getSource)
      if (changeStatus) source.updateTaskStatus(id, toStatusSlug).catch(() => refetchTasks())
      source.updateTaskRank(id, newRank).catch(() => refetchTasks())
    }
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
    const task = tasks.find(t => t.id === id)
    if (!task) return
    // Backstop for the UI-level filtering (which already excludes cross-source
    // options): a task is backed by its own source's store, so it can't move
    // to a status living in a different source.
    if (getStatusSource(statusSlug).id !== task.sourceId) {
      throw new Error(`Cannot set task ${id} to status "${statusSlug}" in a different source`)
    }
    try {
      const source = sourceOf(task, getSource)
      await source.updateTaskStatus(id, statusSlug)
      await source.updateTaskRank(id, newRank)
      setTasks(prev => {
        const updated = prev.map(t => t.id === id ? { ...t, statusSlug, rank: newRank } : t)
        return updated.sort(byRank)
      })
    } catch {
      await refetchTasks()
    }
  }

  function renameTask(id: number, name: string): void {
    const task = tasks.find(t => t.id === id)
    if (task) sourceOf(task, getSource).updateTaskName(id, name).catch(() => refetchTasks())
    setTasks(prev => prev.map(t => t.id === id ? { ...t, name } : t))
  }

  function updateNotes(id: number, notes: string): void {
    const task = tasks.find(t => t.id === id)
    if (task) sourceOf(task, getSource).updateTaskNotes(id, notes).catch(() => refetchTasks())
    setTasks(prev => prev.map(t => t.id === id ? { ...t, notes } : t))
  }

  async function deleteTask(id: number): Promise<void> {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    try {
      await sourceOf(task, getSource).deleteTask(id)
      setTasks(prev => prev.filter(t => t.id !== id))
    } catch {
      await refetchTasks()
    }
  }

  async function createTask(name: string, rank: string, statusSlug: string): Promise<Task> {
    try {
      const selectedSourceId = readSelectedSourceId()
      const source = selectedSourceId !== null && allSources.some((s) => s.id === selectedSourceId)
        ? getSource(selectedSourceId)
        : defaultSource
      const task = await source.createTask(name, rank, statusSlug)
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

  async function createStatus(name: string, slug: string, sourceId: string): Promise<void> {
    await getSource(sourceId).createStatus(name, slug)
    await refetchAll()
  }

  async function updateStatus(oldSlug: string, newSlug: string, name: string): Promise<void> {
    await getStatusSource(oldSlug).updateStatus(oldSlug, newSlug, name)
    await refetchAll()
  }

  async function deleteStatus(slug: string): Promise<void> {
    await getStatusSource(slug).deleteStatus(slug)
    await refetchAll()
  }

  async function reassignAndDeleteStatus(fromSlug: string, toSlug: string): Promise<void> {
    const source = getStatusSource(fromSlug)
    // Backstop for the UI-level filtering (which already excludes cross-source
    // options): a source's tasks are backed by its own store, so reassigning
    // into another source's status isn't meaningful.
    if (getStatusSource(toSlug).id !== source.id) {
      throw new Error(`Cannot reassign status "${fromSlug}" to status "${toSlug}" in a different source`)
    }
    await source.reassignStatus(fromSlug, toSlug)
    await source.deleteStatus(fromSlug)
    await refetchAll()
  }

  function getStatusUsage(slug: string): Promise<StatusUsage> {
    return getStatusSource(slug).getStatusUsage(slug)
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

  function requestTaskPage(section: SectionRef): void {
    const sectionKey = sectionPagingKey(section)
    const current = sectionPagingRef.current[sectionKey] ?? DEFAULT_SECTION_PAGING
    if (current.isLoading || !current.hasMore) return

    setSectionPaging(prev => ({ ...prev, [sectionKey]: { ...current, isLoading: true } }))

    const pageRequest = section === ARCHIVE_VIEW_ID
      ? defaultSource.loadArchivedTaskPage(current.offset)
      : defaultSource.loadTaskPageForStatus(section.slug, current.offset)

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
    defaultSource,
    getSource,
    allSources,
  }

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}
