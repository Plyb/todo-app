import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { Status } from './types'
import type { TaskSource } from './sources'
import SettingsPage from './SettingsPage'

const createStatus = vi.fn()
const updateStatus = vi.fn()
const deleteStatus = vi.fn()
const reassignAndDeleteStatus = vi.fn()
const getStatusUsage = vi.fn()

const useStatusesMock = vi.fn()
const useAllSourcesMock = vi.fn()

// SettingsPage (and StatusEditorModal, which it renders) only reach into
// tasks-context for statuses/sources - views and the auto-archive/view-selector
// settings below them aren't the concern of these tests, so they're stubbed
// with the minimum that lets the page render.
vi.mock('./tasks-context', () => ({
  useStatuses: () => useStatusesMock(),
  useViews: () => ({ views: [], saveView: vi.fn(), deleteView: vi.fn() }),
  useDefaultSource: () => ({ id: 'indexeddb' }),
  useAllSources: () => useAllSourcesMock(),
}))

function makeStatus(overrides: Partial<Status> = {}): Status {
  return { slug: 'today', name: 'Today', sourceId: 'indexeddb', ...overrides }
}

function fakeSource(id: string): TaskSource {
  return { id } as TaskSource
}

function setStatuses(statuses: Status[]) {
  useStatusesMock.mockReturnValue({ statuses, createStatus, updateStatus, deleteStatus, reassignAndDeleteStatus, getStatusUsage })
}

// Both the Views and Statuses sections render their own "+" add button; the
// Statuses one is the second in document order.
function clickAddStatus() {
  screen.getAllByRole('button', { name: '+' })[1].click()
}

beforeEach(() => {
  createStatus.mockClear()
  updateStatus.mockClear()
  deleteStatus.mockClear()
  reassignAndDeleteStatus.mockClear()
  getStatusUsage.mockClear()
  useAllSourcesMock.mockReturnValue([fakeSource('indexeddb'), fakeSource('other-source')])
})

afterEach(cleanup)

describe('SettingsPage status source picker (issue #261)', () => {
  it('shows a source picker when creating a new status, and creates it in the chosen source', () => {
    setStatuses([makeStatus()])
    render(<SettingsPage onBack={() => {}} />)

    act(() => clickAddStatus())

    expect(screen.getByText('Source')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Custom Status' } })
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'custom-status' } })
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'other-source' } })

    act(() => screen.getByText('Save').click())

    expect(createStatus).toHaveBeenCalledWith('Custom Status', 'custom-status', 'other-source')
  })

  it('does not show a source picker when editing an existing status', () => {
    setStatuses([makeStatus({ slug: 'today', name: 'Today' })])
    render(<SettingsPage onBack={() => {}} />)

    act(() => screen.getByText('Today').click())

    expect(screen.queryByText('Source')).not.toBeInTheDocument()
  })
})

describe('SettingsPage reassign-to picker (issue #261)', () => {
  it('only offers statuses from the same source as the one being reassigned/deleted', async () => {
    getStatusUsage.mockResolvedValue({ taskIds: [1], viewIds: [] })
    setStatuses([
      makeStatus({ slug: 'today', name: 'Today', sourceId: 'indexeddb' }),
      makeStatus({ slug: 'backlog', name: 'Backlog', sourceId: 'indexeddb' }),
      makeStatus({ slug: 'other-status', name: 'Other Status', sourceId: 'other-source' }),
    ])
    render(<SettingsPage onBack={() => {}} />)

    await act(async () => {
      screen.getByLabelText('Delete Today').click()
    })

    const reassignTitle = screen.getByText('Reassign to...')
    // Scoped to the reassign modal itself - "Backlog"/"Other Status" also each
    // appear once more, unfiltered, in the Statuses list underneath it.
    const reassignModal = within(reassignTitle.closest('div')!.parentElement!)
    expect(reassignModal.getByText('Backlog')).toBeInTheDocument()
    expect(reassignModal.queryByText('Other Status')).not.toBeInTheDocument()
  })
})
