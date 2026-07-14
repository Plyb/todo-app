import type { Task, BlockingRelationship, SubtaskLink } from '../types'

export function groupBlockingRelationships(
  task: Task,
  allTasks: Task[],
  blockingRelationships: BlockingRelationship[]
): Array<{ label: string; tasks: Task[] }> {
  const blocksGroup = {
    label: 'Blocks',
    tasks: blockingRelationships
      .filter((r) => r.fromTaskId === task.id)
      .map((r) => allTasks.find((t) => t.id === r.toTaskId))
      .filter((t): t is Task => t !== undefined),
  }

  const blockedByGroup = {
    label: 'Blocked by',
    tasks: blockingRelationships
      .filter((r) => r.toTaskId === task.id)
      .map((r) => allTasks.find((t) => t.id === r.fromTaskId))
      .filter((t): t is Task => t !== undefined),
  }

  return [
    ...(blocksGroup.tasks.length > 0 ? [blocksGroup] : []),
    ...(blockedByGroup.tasks.length > 0 ? [blockedByGroup] : []),
  ]
}

export function resolveSubtaskItems(
  subtaskLinks: SubtaskLink[],
  allTasks: Task[]
): Array<{ id: number; link: SubtaskLink; childTask: Task }> {
  return subtaskLinks
    .map((link) => {
      const childTask = allTasks.find((t) => t.id === link.childTaskId)
      return childTask ? { id: link.id, link, childTask } : undefined
    })
    .filter((item): item is { id: number; link: SubtaskLink; childTask: Task } => item !== undefined)
}
