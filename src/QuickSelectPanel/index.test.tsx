import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { Task } from '../types'
import { QuickSelectPanel } from './index'

const setArchived = vi.fn()

// The archive toggle's deferred-commit contract is what's under test here, so the
// rest of the tasks-context API is stubbed out - other QuickSelectPanel subsections
// call these on mount/render but their behavior isn't the concern of this test.
vi.mock('../tasks-context', () => {
  // A single stable stub so the subsections' load-on-mount effects don't re-fire
  // on every render (an unstable source identity would loop).
  const source = {
    loadSubtaskLinks: () => Promise.resolve([]),
    loadParentLink: () => Promise.resolve(undefined),
    loadBlocks: () => Promise.resolve([]),
    loadScheduledTransitions: () => Promise.resolve([]),
  }
  return {
    useTasks: () => ({
      setDone: vi.fn(),
      renameTask: vi.fn(),
      updateNotes: vi.fn(),
      createTask: vi.fn(),
      setArchived,
    }),
    useSource: () => source,
  }
})

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    name: 'Test task',
    completedAt: null,
    archivedAt: null,
    rank: '0',
    statusSlug: 'today',
    notes: '',
    sourceId: 'indexeddb',
    ...overrides,
  }
}

const noop = () => {}

function renderPanel(task: Task) {
  return render(
    <QuickSelectPanel
      task={task}
      statuses={[]}
      allTasks={[task]}
      onClose={noop}
      onChangeStatus={noop}
      onDelete={noop}
      onOpenTask={noop}
      onBlockingRelationshipAdded={noop}
      onSubtaskLinkAdded={noop}
    />
  )
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  setArchived.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('QuickSelectPanel archive toggle', () => {
  it('does not call setArchived while the panel is still open', async () => {
    const task = makeTask({ archivedAt: null })
    renderPanel(task)

    const checkbox = screen.getByRole('checkbox', { name: 'Archived' })
    await act(async () => {
      checkbox.click()
    })

    expect(checkbox).toBeChecked()
    expect(setArchived).not.toHaveBeenCalled()
  })

  it('commits the toggled value once the panel closes', async () => {
    const task = makeTask({ archivedAt: null })
    renderPanel(task)

    const checkbox = screen.getByRole('checkbox', { name: 'Archived' })
    await act(async () => {
      checkbox.click()
    })

    const nameInput = screen.getByDisplayValue(task.name)
    await act(async () => {
      nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(setArchived).toHaveBeenCalledTimes(1)
    expect(setArchived).toHaveBeenCalledWith(task.id, true)
  })

  it('does not call setArchived on close when the toggle was never touched', async () => {
    const task = makeTask({ archivedAt: null })
    renderPanel(task)

    const nameInput = screen.getByDisplayValue(task.name)
    await act(async () => {
      nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(setArchived).not.toHaveBeenCalled()
  })

  it('does not call setArchived on close when the toggle is flipped back to its original value', async () => {
    const task = makeTask({ archivedAt: null })
    renderPanel(task)

    const checkbox = screen.getByRole('checkbox', { name: 'Archived' })
    await act(async () => {
      checkbox.click()
    })
    await act(async () => {
      checkbox.click()
    })

    const nameInput = screen.getByDisplayValue(task.name)
    await act(async () => {
      nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(setArchived).not.toHaveBeenCalled()
  })
})
