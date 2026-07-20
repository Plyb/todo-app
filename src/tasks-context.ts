import { createContext, useContext } from 'react'
import type { Task, Status, View, UserDefinedView } from './types'
import type { StatusUsage } from './db'
import type { TaskSource } from './sources'
import type { SectionPagingInfo } from './view-utils'

export type SourcesApi = {
  defaultSource: TaskSource
  getSource: (id: string) => TaskSource
  allSources: TaskSource[]
}

export type TasksApi = {
  tasks: Task[]
  autoTransitionedTaskIds: Set<number>
  sectionPaging: Record<string, SectionPagingInfo>
  requestTaskPage: (sectionKey: string) => void
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
  currentViewId: string
  recentViewIds: string[]
  openView: (id: string) => void
  saveView: (view: UserDefinedView) => Promise<void>
  deleteView: (id: string) => Promise<void>
}

export type TasksContextValue = TasksApi & StatusesApi & ViewsApi & SourcesApi

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
    sectionPaging: c.sectionPaging,
    requestTaskPage: c.requestTaskPage,
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
    currentViewId: c.currentViewId,
    recentViewIds: c.recentViewIds,
    openView: c.openView,
    saveView: c.saveView,
    deleteView: c.deleteView,
  }
}

export function useDefaultSource(): TaskSource {
  return useTasksContext().defaultSource
}

export function useSource(id: string): TaskSource {
  return useTasksContext().getSource(id)
}

export function useAllSources(): TaskSource[] {
  return useTasksContext().allSources
}
