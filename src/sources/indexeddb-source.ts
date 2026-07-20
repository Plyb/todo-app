import * as db from '../db'
import { stripSourceId, withSourceId } from './source-utils'
import type { IndexedDbSourceConfiguration, TaskSource } from './types'

export function createIndexedDbSource(config: IndexedDbSourceConfiguration): TaskSource {
  const { id: sourceId } = config

  return {
    id: sourceId,

    loadTaskPageForStatus: async (statusSlug, offset, limit) => {
      const page = await db.loadTaskPageForStatus(statusSlug, offset, limit)
      return { ...page, tasks: page.tasks.map((task) => withSourceId(task, sourceId)) }
    },
    loadArchivedTaskPage: async (offset, limit) => {
      const page = await db.loadArchivedTaskPage(offset, limit)
      return { ...page, tasks: page.tasks.map((task) => withSourceId(task, sourceId)) }
    },
    loadTasksByIds: async (ids) => (await db.loadTasksByIds(ids)).map((task) => withSourceId(task, sourceId)),
    createTask: async (name, rank, statusSlug) => withSourceId(await db.createTask(name, rank, statusSlug), sourceId),
    saveTask: (task) => db.saveTask(stripSourceId(task)),
    updateTaskCompletedAt: db.updateTaskCompletedAt,
    updateTaskArchivedAt: db.updateTaskArchivedAt,
    updateTaskRank: db.updateTaskRank,
    updateTaskName: db.updateTaskName,
    updateTaskNotes: db.updateTaskNotes,
    updateTaskStatus: db.updateTaskStatus,
    deleteTask: db.deleteTask,

    loadStatuses: async () => (await db.loadStatuses()).map((status) => withSourceId(status, sourceId)),
    createStatus: async (name, slug) => withSourceId(await db.createStatus(name, slug), sourceId),
    updateStatus: db.updateStatus,
    deleteStatus: db.deleteStatus,
    getStatusUsage: db.getStatusUsage,
    isStatusInUse: db.isStatusInUse,
    reassignStatus: db.reassignStatus,

    loadBlocks: db.loadBlocks,
    loadAllBlocks: db.loadAllBlocks,
    addBlock: db.addBlock,
    deleteBlock: db.deleteBlock,
    deleteBlocksByTask: db.deleteBlocksByTask,

    loadSubtaskLinks: db.loadSubtaskLinks,
    loadParentLink: db.loadParentLink,
    loadAllSubtaskLinks: db.loadAllSubtaskLinks,
    createSubtaskLink: db.createSubtaskLink,
    updateSubtaskLinkRank: db.updateSubtaskLinkRank,
    deleteSubtaskLinksByParent: db.deleteSubtaskLinksByParent,
    deleteSubtaskLinksByChild: db.deleteSubtaskLinksByChild,

    loadScheduledTransitions: async (taskId) =>
      (await db.loadScheduledTransitions(taskId)).map((transition) => withSourceId(transition, sourceId)),
    addScheduledTransition: async (taskId, date, statusSlug) =>
      withSourceId(await db.addScheduledTransition(taskId, date, statusSlug), sourceId),
    deleteScheduledTransition: db.deleteScheduledTransition,
    loadAllDueTransitions: async () =>
      (await db.loadAllDueTransitions()).map((transition) => withSourceId(transition, sourceId)),
  }
}
