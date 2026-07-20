import * as db from '../db'
import type { IndexedDbSourceConfiguration, TaskSource } from './types'

// Adapts the raw IndexedDB functions in db/*.ts to the TaskSource interface.
// The functions are standalone (no `this`), so the source is just a thin
// binding of each method to its db counterpart.
export function createIndexedDbSource(config: IndexedDbSourceConfiguration): TaskSource {
  return {
    id: config.id,

    loadTaskPageForStatus: db.loadTaskPageForStatus,
    loadArchivedTaskPage: db.loadArchivedTaskPage,
    loadTasksByIds: db.loadTasksByIds,
    createTask: db.createTask,
    saveTask: db.saveTask,
    updateTaskCompletedAt: db.updateTaskCompletedAt,
    updateTaskArchivedAt: db.updateTaskArchivedAt,
    updateTaskRank: db.updateTaskRank,
    updateTaskName: db.updateTaskName,
    updateTaskNotes: db.updateTaskNotes,
    updateTaskStatus: db.updateTaskStatus,
    deleteTask: db.deleteTask,

    loadStatuses: db.loadStatuses,
    createStatus: db.createStatus,
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

    loadScheduledTransitions: db.loadScheduledTransitions,
    addScheduledTransition: db.addScheduledTransition,
    deleteScheduledTransition: db.deleteScheduledTransition,
    loadAllDueTransitions: db.loadAllDueTransitions,
  }
}
