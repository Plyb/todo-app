import { createContext, useContext } from 'react'
import type { Task, Status, View, UserDefinedView } from './types'
import type { StatusUsage } from './db'

export type TasksApi = {
  tasks: Task[]
  autoTransitionedTaskIds: Set<number>
  setDone: (id: number, done: boolean) => void
  setArchived: (id: number, archived: boolean) => void
  moveTask: (id: number, toStatusSlug: string, newRank: string, changeStatus: boolean) => void
  setStatus: (id: number, statusSlug: string) => Promise<void>
  renameTask: (id: number, name: string) => void
  updateNotes: (id: number, notes: string) => void
  deleteTask: (id: number) => Promise<void>
  createTask: (name: string, rank: string, statusSlug: string) => Promise<Task>
  clearAutoTransitionIndicator: (id: number) => void
}

export type StatusesApi = {
  statuses: Status[]
  createStatus: (name: string, slug: string) => Promise<void>
  updateStatus: (oldSlug: string, newSlug: string, name: string) => Promise<void>
  deleteStatus: (slug: string) => Promise<void>
  reassignAndDeleteStatus: (fromSlug: string, toSlug: string) => Promise<void>
  getStatusUsage: (slug: string) => Promise<StatusUsage>
}

export type ViewsApi = {
  views: View[]
  currentViewSlug: string
  recentViewSlugs: string[]
  openView: (slug: string) => void
  saveView: (view: UserDefinedView) => Promise<void>
  deleteView: (slug: string) => Promise<void>
}

export type TasksContextValue = TasksApi & StatusesApi & ViewsApi

export const TasksContext = createContext<TasksContextValue | null>(null)

function useTasksContext(): TasksContextValue {
  const ctx = useContext(TasksContext)
  if (!ctx) throw new Error('useTasksContext must be used within a TasksProvider')
  return ctx
}

export function useTasks(): TasksApi {
  const c = useTasksContext()
  return {
    tasks: c.tasks,
    autoTransitionedTaskIds: c.autoTransitionedTaskIds,
    setDone: c.setDone,
    setArchived: c.setArchived,
    moveTask: c.moveTask,
    setStatus: c.setStatus,
    renameTask: c.renameTask,
    updateNotes: c.updateNotes,
    deleteTask: c.deleteTask,
    createTask: c.createTask,
    clearAutoTransitionIndicator: c.clearAutoTransitionIndicator,
  }
}

export function useStatuses(): StatusesApi {
  const c = useTasksContext()
  return {
    statuses: c.statuses,
    createStatus: c.createStatus,
    updateStatus: c.updateStatus,
    deleteStatus: c.deleteStatus,
    reassignAndDeleteStatus: c.reassignAndDeleteStatus,
    getStatusUsage: c.getStatusUsage,
  }
}

export function useViews(): ViewsApi {
  const c = useTasksContext()
  return {
    views: c.views,
    currentViewSlug: c.currentViewSlug,
    recentViewSlugs: c.recentViewSlugs,
    openView: c.openView,
    saveView: c.saveView,
    deleteView: c.deleteView,
  }
}
