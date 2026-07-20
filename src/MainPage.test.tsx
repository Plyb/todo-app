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
// source on mount (and again after every add), regardless of whether any
// task's panel was even open. These tests lock in the replacement -
// relationship data is only ever fetched once a task's QuickSelectPanel is
// opened, scoped to that one task, via the source's per-task methods.
const archivedTask: Task = {
  id: 101,
  name: 'Archived task',
  completedAt: null,
  archivedAt: '2024-01-01',
  rank: '0',
  statusSlug: 'todo',
  notes: '',
  sourceId: 'indexeddb',
}

const otherTask: Task = {
  id: 102,
  name: 'Other task',
  completedAt: null,
  archivedAt: null,
  rank: '0',
  statusSlug: 'todo',
  notes: '',
  sourceId: 'indexeddb',
}

const source = {
  loadBlocks: vi.fn(() => Promise.resolve([])),
  loadAllBlocks: vi.fn(() => Promise.resolve([])),
  loadParentLink: vi.fn(() => Promise.resolve(undefined)),
  loadSubtaskLinks: vi.fn(() => Promise.resolve([])),
  loadAllSubtaskLinks: vi.fn(() => Promise.resolve([])),
  loadScheduledTransitions: vi.fn(() => Promise.resolve([])),
  addBlock: vi.fn((fromTaskId: number, toTaskId: number, type: 'blocks') =>
    Promise.resolve({ id: 999, fromTaskId, toTaskId, type })
  ),
}

vi.mock('./tasks-context', () => ({
  useTasks: () => ({
    tasks: [archivedTask, otherTask],
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
}))

describe('MainPage relationship loading (issue #260)', () => {
  beforeEach(() => {
    Object.values(source).forEach((fn) => fn.mockClear())
  })

  afterEach(() => {
    cleanup()
  })

  it('does not fetch any relationship data on mount, before any panel is opened', async () => {
    await act(async () => {
      render(<MainPage onNavigateToSettings={() => {}} />)
    })

    expect(source.loadBlocks).not.toHaveBeenCalled()
    expect(source.loadAllBlocks).not.toHaveBeenCalled()
    expect(source.loadParentLink).not.toHaveBeenCalled()
    expect(source.loadSubtaskLinks).not.toHaveBeenCalled()
    expect(source.loadAllSubtaskLinks).not.toHaveBeenCalled()
  })

  it('fetches blocks/subtasks scoped to a task only once its panel is opened', async () => {
    await act(async () => {
      render(<MainPage onNavigateToSettings={() => {}} />)
    })

    await act(async () => {
      screen.getByText(archivedTask.name).click()
    })

    expect(source.loadBlocks).toHaveBeenCalledWith(archivedTask.id)
    expect(source.loadParentLink).toHaveBeenCalledWith(archivedTask.id)
    expect(source.loadSubtaskLinks).toHaveBeenCalledWith(archivedTask.id)
    expect(source.loadAllBlocks).not.toHaveBeenCalled()
    expect(source.loadAllSubtaskLinks).not.toHaveBeenCalled()
  })

  it('reloads scoped to the task after adding a relationship, rather than doing a full reload', async () => {
    await act(async () => {
      render(<MainPage onNavigateToSettings={() => {}} />)
    })

    await act(async () => {
      screen.getByText(archivedTask.name).click()
    })

    await act(async () => {
      screen.getByText('Add Relationship').click()
    })

    await act(async () => {
      screen.getByText(otherTask.name).click()
    })

    const blocksButton = screen.getAllByRole('button').find((b) => b.textContent?.startsWith('Blocks —'))!
    await act(async () => {
      blocksButton.click()
    })

    expect(source.addBlock).toHaveBeenCalledWith(archivedTask.id, otherTask.id, 'blocks')
    expect(source.loadBlocks).toHaveBeenCalledTimes(2)
    expect(source.loadBlocks).toHaveBeenNthCalledWith(2, archivedTask.id)
    expect(source.loadAllBlocks).not.toHaveBeenCalled()
  })
})
