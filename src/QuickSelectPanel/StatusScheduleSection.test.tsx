import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { Status, Task } from '../types'
import { StatusScheduleSection } from './StatusScheduleSection'

// StatusScheduleSection only reaches into tasks-context for the task's own
// source's scheduled transitions - stub that out so the direct status picker's
// filtering (the thing under test) is exercised in isolation. A single stable
// stub, since an unstable source identity would re-fire the load-on-mount
// effect on every render and loop.
vi.mock('../tasks-context', () => {
  const source = { loadScheduledTransitions: () => Promise.resolve([]) }
  return { useSource: () => source }
})

afterEach(cleanup)

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

const statuses: Status[] = [
  { slug: 'today', name: 'Today', sourceId: 'indexeddb' },
  { slug: 'backlog', name: 'Backlog', sourceId: 'indexeddb' },
  { slug: 'other-status', name: 'Other Status', sourceId: 'other-source' },
]

describe('StatusScheduleSection direct status picker (issue #261)', () => {
  it('only offers statuses backed by the task\'s own source', async () => {
    const task = makeTask({ sourceId: 'indexeddb' })
    render(<StatusScheduleSection task={task} statuses={statuses} onChangeStatus={() => {}} />)

    await act(async () => {
      screen.getByText('Today').click()
    })

    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.queryByText('Other Status')).not.toBeInTheDocument()
  })

  it('reports the selected same-source status back to the caller', async () => {
    const task = makeTask({ sourceId: 'indexeddb' })
    const onChangeStatus = vi.fn()
    render(<StatusScheduleSection task={task} statuses={statuses} onChangeStatus={onChangeStatus} />)

    await act(async () => {
      screen.getByText('Today').click()
    })
    await act(async () => {
      screen.getByText('Backlog').click()
    })

    expect(onChangeStatus).toHaveBeenCalledWith(task.id, 'backlog')
  })
})
