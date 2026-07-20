import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import MainPage, { TaskRow } from './MainPage'
import type { Task } from './types'
import { ARCHIVE_VIEW_ID } from './synthetic-view-utils'

const task: Task = {
  id: 1,
  name: 'Buy milk',
  completedAt: null,
  archivedAt: null,
  rank: '0',
  statusSlug: 'todo',
  notes: '',
  sourceId: 'indexeddb',
}

describe('TaskRow', () => {
  it('does not bubble the checkbox click to the row (which would open quick-select)', () => {
    const onRowClick = vi.fn()
    const onDoneChange = vi.fn()

    render(
      <ul>
        <li onClick={onRowClick}>
          <TaskRow task={task} onDoneChange={onDoneChange} isBlocked={false} />
        </li>
      </ul>
    )

    screen.getByRole('checkbox').click()

    expect(onDoneChange).toHaveBeenCalledWith(true)
    expect(onRowClick).not.toHaveBeenCalled()
  })
})

// Covers issue #260: MainPage used to load blocks/subtasks across every
// source on mount (and again after every add) via loadAllBlocks()/
// loadAllSubtaskLinks() - a full-table scan across every source, regardless
// of whether anything was even visible. Per review on PR #265, the list-wide
// isBlocked/parentTaskName indicators are kept (not dropped), but populated
// via the per-task-scoped loadBlocks/loadParentLink for just the bounded set
// of tasks MainPage already holds (issue #249's pagination), cached by task
// id so re-renders don't refetch what's already known. The panel's own
// lazily-loaded data (loadSubtaskLinks, used for the "Subtasks" list) stays
// untouched by this cache and only loads once a task's panel opens.
const taskA: Task = {
  id: 101,
  name: 'Task A',
  completedAt: null,
  archivedAt: '2024-01-01',
  rank: '0',
  statusSlug: 'todo',
  notes: '',
  sourceId: 'indexeddb',
}

const childTask: Task = {
  id: 102,
  name: 'Child task',
  completedAt: null,
  archivedAt: '2024-01-02',
  rank: '0',
  statusSlug: 'todo',
  notes: '',
  sourceId: 'indexeddb',
}

const otherTask: Task = {
  id: 103,
  name: 'Other task',
  completedAt: null,
  archivedAt: null,
  rank: '0',
  statusSlug: 'todo',
  notes: '',
  sourceId: 'indexeddb',
}

const allMockTasks = [taskA, childTask, otherTask]

// Stateful stand-in for the IndexedDB source: loadBlocks/loadParentLink read
// from these arrays live (rather than a fixed canned response) so that both
// RelatedTasksSection's own reload and MainPage's separate cache-refresh see
// the same up-to-date result after addBlock runs.
let relationships: { id: number; fromTaskId: number; toTaskId: number; type: 'blocks' }[] = []
let subtaskLinks: { id: number; parentTaskId: number; childTaskId: number; rank: string }[] = []
let nextRelationshipId = 1

const source = {
  id: 'indexeddb',
  loadBlocks: vi.fn((taskId: number) =>
    Promise.resolve(relationships.filter((r) => r.fromTaskId === taskId || r.toTaskId === taskId))
  ),
  loadAllBlocks: vi.fn(() => Promise.resolve(relationships)),
  loadParentLink: vi.fn((taskId: number) => Promise.resolve(subtaskLinks.find((l) => l.childTaskId === taskId))),
  loadSubtaskLinks: vi.fn((parentTaskId: number) =>
    Promise.resolve(subtaskLinks.filter((l) => l.parentTaskId === parentTaskId))
  ),
  loadAllSubtaskLinks: vi.fn(() => Promise.resolve(subtaskLinks)),
  loadScheduledTransitions: vi.fn(() => Promise.resolve([])),
  addBlock: vi.fn((fromTaskId: number, toTaskId: number, type: 'blocks') => {
    const relationship = { id: nextRelationshipId++, fromTaskId, toTaskId, type }
    relationships = [...relationships, relationship]
    return Promise.resolve(relationship)
  }),
}

vi.mock('./tasks-context', () => ({
  useTasks: () => ({
    tasks: allMockTasks,
    autoTransitionedTaskIds: new Set<number>(),
    sectionPaging: { [ARCHIVE_VIEW_ID]: { offset: 0, isLoading: false, hasMore: false } },
    requestTaskPage: vi.fn(),
    setDone: vi.fn(),
    setArchived: vi.fn(),
    moveTask: vi.fn(),
    setStatus: vi.fn(),
    renameTask: vi.fn(),
    updateNotes: vi.fn(),
    deleteTask: vi.fn(),
    createTask: vi.fn(),
    clearAutoTransitionIndicator: vi.fn(),
  }),
  useStatuses: () => ({ statuses: [] }),
  useViews: () => ({
    views: [{ id: ARCHIVE_VIEW_ID, name: 'Archive' }],
    currentViewId: ARCHIVE_VIEW_ID,
    recentViewIds: [ARCHIVE_VIEW_ID],
    openView: vi.fn(),
    saveView: vi.fn(),
    deleteView: vi.fn(),
  }),
  useSource: () => source,
  useAllSources: () => [source],
  useDefaultSource: () => source,
}))

// ArchiveView marks only the actual task row with data-item-row (the
// expanded QuickSelectPanel slot is a plain <li>), so this is the reliable
// way to find "the row for task X" even while its panel is open. Matching
// against just the row's first <span> (TaskRow's own name span, which holds
// only the optional ⊘ marker plus task.name) rather than the row's full
// textContent avoids false matches from a sibling row's "↳ <name>" annotation
// pointing at this same task.
function getTaskRow(name: string): HTMLElement {
  const row = Array.from(document.querySelectorAll('li[data-item-row]')).find((el) =>
    el.querySelector('span')?.textContent?.includes(name)
  )
  if (!row) throw new Error(`no row found for task "${name}"`)
  return row as HTMLElement
}

describe('MainPage relationship loading (issue #260)', () => {
  beforeEach(() => {
    relationships = [{ id: 0, fromTaskId: taskA.id, toTaskId: childTask.id, type: 'blocks' }]
    subtaskLinks = [{ id: 0, parentTaskId: taskA.id, childTaskId: childTask.id, rank: '0' }]
    nextRelationshipId = 1
    Object.values(source).forEach((fn) => vi.isMockFunction(fn) && fn.mockClear())
  })

  afterEach(() => {
    cleanup()
  })

  it('shows isBlocked/parentTaskName for the rendered tasks, fetched per-task rather than via a full-table scan', async () => {
    await act(async () => {
      render(<MainPage onNavigateToSettings={() => {}} />)
    })

    // childTask is blocked by taskA and is taskA's child - both indicators on one row.
    expect(getTaskRow(childTask.name).textContent).toContain('⊘')
    expect(getTaskRow(childTask.name).textContent).toContain(`↳ ${taskA.name}`)
    // taskA itself is neither blocked nor anyone's child.
    expect(getTaskRow(taskA.name).textContent).not.toContain('⊘')
    expect(getTaskRow(taskA.name).textContent).not.toContain('↳')

    // Scoped per-task calls for every task MainPage holds, never the full-table variants.
    expect(source.loadBlocks).toHaveBeenCalledWith(taskA.id)
    expect(source.loadBlocks).toHaveBeenCalledWith(childTask.id)
    expect(source.loadParentLink).toHaveBeenCalledWith(taskA.id)
    expect(source.loadParentLink).toHaveBeenCalledWith(childTask.id)
    expect(source.loadAllBlocks).not.toHaveBeenCalled()
    expect(source.loadAllSubtaskLinks).not.toHaveBeenCalled()
  })

  it('does not fetch a panel-only task\'s subtask list until its panel is opened', async () => {
    await act(async () => {
      render(<MainPage onNavigateToSettings={() => {}} />)
    })

    // loadSubtaskLinks backs the panel's own "Subtasks" section, not the list-level
    // cache above, so it should stay untouched until a task's panel actually opens.
    expect(source.loadSubtaskLinks).not.toHaveBeenCalled()

    await act(async () => {
      getTaskRow(taskA.name).click()
    })

    expect(source.loadSubtaskLinks).toHaveBeenCalledWith(taskA.id)
  })

  it('does not refetch already-cached tasks on a re-render', async () => {
    const { rerender } = render(<MainPage onNavigateToSettings={() => {}} />)
    await act(async () => {})

    const blocksCallsAfterMount = source.loadBlocks.mock.calls.length
    const parentLinkCallsAfterMount = source.loadParentLink.mock.calls.length
    expect(blocksCallsAfterMount).toBeGreaterThan(0)

    await act(async () => {
      rerender(<MainPage onNavigateToSettings={() => {}} />)
    })

    expect(source.loadBlocks).toHaveBeenCalledTimes(blocksCallsAfterMount)
    expect(source.loadParentLink).toHaveBeenCalledTimes(parentLinkCallsAfterMount)
  })

  it('refreshes the affected task\'s cached indicator after adding a relationship, without a full reload', async () => {
    await act(async () => {
      render(<MainPage onNavigateToSettings={() => {}} />)
    })

    // taskA starts out not blocked.
    expect(getTaskRow(taskA.name).textContent).not.toContain('⊘')

    await act(async () => {
      getTaskRow(taskA.name).click()
    })

    await act(async () => {
      screen.getByText('Add Relationship').click()
    })

    await act(async () => {
      screen.getByText(otherTask.name).click()
    })

    const blockedByButton = screen.getAllByRole('button').find((b) => b.textContent?.startsWith('Blocked By'))!
    await act(async () => {
      blockedByButton.click()
    })

    expect(source.addBlock).toHaveBeenCalledWith(otherTask.id, taskA.id, 'blocks')
    expect(getTaskRow(taskA.name).textContent).toContain('⊘')
    expect(source.loadAllBlocks).not.toHaveBeenCalled()
  })
})
