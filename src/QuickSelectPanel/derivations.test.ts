import { describe, expect, it } from 'vitest'
import { groupBlockingRelationships, resolveSubtaskItems } from './derivations'
import type { Task, BlockingRelationship, SubtaskLink } from '../types'

function makeTask(id: number, name: string): Task {
  return { id, name, done: false, rank: '0', statusSlug: 'backlog', notes: '' }
}

describe('groupBlockingRelationships', () => {
  const task = makeTask(1, 'Task 1')
  const blocked = makeTask(2, 'Task 2')
  const blocker = makeTask(3, 'Task 3')
  const allTasks = [task, blocked, blocker]

  it('returns an empty array when there are no blocking relationships', () => {
    expect(groupBlockingRelationships(task, allTasks, [])).toEqual([])
  })

  it('includes only the Blocks group when the task only blocks others', () => {
    const relationships: BlockingRelationship[] = [{ id: 1, fromTaskId: 1, toTaskId: 2, type: 'blocks' }]

    const result = groupBlockingRelationships(task, allTasks, relationships)

    expect(result).toEqual([{ label: 'Blocks', tasks: [blocked] }])
  })

  it('includes only the Blocked by group when the task is only blocked', () => {
    const relationships: BlockingRelationship[] = [{ id: 1, fromTaskId: 3, toTaskId: 1, type: 'blocks' }]

    const result = groupBlockingRelationships(task, allTasks, relationships)

    expect(result).toEqual([{ label: 'Blocked by', tasks: [blocker] }])
  })

  it('includes both groups when the task blocks and is blocked', () => {
    const relationships: BlockingRelationship[] = [
      { id: 1, fromTaskId: 1, toTaskId: 2, type: 'blocks' },
      { id: 2, fromTaskId: 3, toTaskId: 1, type: 'blocks' },
    ]

    const result = groupBlockingRelationships(task, allTasks, relationships)

    expect(result).toEqual([
      { label: 'Blocks', tasks: [blocked] },
      { label: 'Blocked by', tasks: [blocker] },
    ])
  })

  it('drops relationships that reference a dangling task id', () => {
    const relationships: BlockingRelationship[] = [{ id: 1, fromTaskId: 1, toTaskId: 999, type: 'blocks' }]

    const result = groupBlockingRelationships(task, allTasks, relationships)

    expect(result).toEqual([])
  })
})

describe('resolveSubtaskItems', () => {
  const child = makeTask(2, 'Child')
  const allTasks = [makeTask(1, 'Parent'), child]

  it('returns an empty array when there are no subtask links', () => {
    expect(resolveSubtaskItems([], allTasks)).toEqual([])
  })

  it('resolves each link to its child task', () => {
    const link: SubtaskLink = { id: 10, parentTaskId: 1, childTaskId: 2, rank: '0' }

    const result = resolveSubtaskItems([link], allTasks)

    expect(result).toEqual([{ id: 10, link, childTask: child }])
  })

  it('omits links whose child task id is dangling', () => {
    const link: SubtaskLink = { id: 10, parentTaskId: 1, childTaskId: 999, rank: '0' }

    const result = resolveSubtaskItems([link], allTasks)

    expect(result).toEqual([])
  })
})
