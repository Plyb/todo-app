import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TaskRow } from './MainPage'
import type { Task } from './types'

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
