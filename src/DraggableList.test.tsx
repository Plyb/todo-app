import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CollisionPriority } from '@dnd-kit/abstract'
import { DraggableList } from './DraggableList'
import { LIST_DROPPABLE_ID } from './drag-utils'

// Capture every useDroppable input while delegating to the real hook, so the
// container's collision priority can be asserted (there's no layout in jsdom to
// exercise real collision detection).
const { droppableInputs } = vi.hoisted(() => ({
  droppableInputs: [] as Array<{ id?: unknown; collisionPriority?: unknown }>,
}))
vi.mock('@dnd-kit/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/react')>()
  return {
    ...actual,
    useDroppable: (input: { id?: unknown; collisionPriority?: unknown }) => {
      droppableInputs.push(input)
      return (actual.useDroppable as (i: unknown) => unknown)(input)
    },
  }
})

// Not wired up project-wide (vitest.config.ts has no `globals: true`, so
// testing-library's own auto-cleanup can't find a global afterEach to hook
// into) - without this, renders from earlier tests in this file accumulate,
// and any test reusing text content across cases (e.g. "Item 2") ambiguously
// matches leftover DOM from a previous one.
afterEach(cleanup)

type Item = { id: number }
type TestSection = { header?: React.ReactNode; items: Item[] }

function renderList(sections: TestSection[]) {
  return render(
    <DraggableList
      sections={sections}
      onReorder={() => {}}
      renderItem={(item: Item) => <span>Item {item.id}</span>}
    />
  )
}

describe('DraggableList flat row rendering', () => {
  it('renders header + item rows in flat DOM order', () => {
    const { container } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
      { header: <h2>Section B</h2>, items: [{ id: 3 }] },
    ])

    const rows = Array.from(container.querySelectorAll('li'))
    expect(
      rows.map((li) => ({
        isItem: li.dataset.itemRow !== undefined,
        text: li.textContent,
      }))
    ).toEqual([
      { isItem: false, text: 'Section A' },
      { isItem: true, text: 'Item 1' },
      { isItem: true, text: 'Item 2' },
      { isItem: false, text: 'Section B' },
      { isItem: true, text: 'Item 3' },
    ])
  })

  it('wraps the rows in a viewport-filling droppable <ul> as the drop-past-end zone', () => {
    const { container } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
      { header: <h2>Section B</h2>, items: [{ id: 3 }] },
    ])

    const list = container.querySelector('ul')!
    expect(list.style.minHeight).toBe('100dvh')
  })

  it('renders an expanded panel row in place of its item', () => {
    const { container } = render(
      <DraggableList
        sections={[{ header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] }]}
        onReorder={() => {}}
        renderItem={(item: Item) => <span>Item {item.id}</span>}
        expandedSlot={{ afterItemId: 2, content: <div>Panel</div> }}
      />
    )

    const rows = Array.from(container.querySelectorAll('li'))
    expect(rows.map((li) => li.textContent)).toEqual(['Section A', 'Item 1', 'Panel'])
  })

  it('registers the list container with the lowest collision priority so a hovered item wins the tie-break near the container center', () => {
    droppableInputs.length = 0
    renderList([{ header: <h2>Section A</h2>, items: [{ id: 1 }] }])

    const containerInput = droppableInputs.find((i) => i.id === LIST_DROPPABLE_ID)
    expect(containerInput).toBeDefined()
    expect(containerInput!.collisionPriority).toBe(CollisionPriority.Lowest)
  })
})

describe('insert button', () => {
  function renderWithInsertButton(sections: TestSection[]) {
    return render(
      <DraggableList
        sections={sections}
        onReorder={() => {}}
        renderItem={(item: Item) => <span>Item {item.id}</span>}
        insertButton={{ onRequestInsert: () => {} }}
      />
    )
  }

  it('is opt-in - omitted entirely when the insertButton prop is not supplied', () => {
    const { container } = renderList([{ header: <h2>Section A</h2>, items: [{ id: 1 }] }])

    expect(container.querySelector('[aria-label="Add task"]')).toBeNull()
  })

  it('renders as a 0-height row hosting the fixed-corner button while idle', () => {
    const { container } = renderWithInsertButton([{ header: <h2>Section A</h2>, items: [{ id: 1 }] }])

    const buttonRow = container.querySelector('button[aria-label="Add task"]')!.closest('li')!
    expect(buttonRow.style.height).toBe('0px')
    expect((container.querySelector('button[aria-label="Add task"]') as HTMLElement).style.position).toBe('fixed')
  })

  it('sits as the array\'s final row', () => {
    const { container } = renderWithInsertButton([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
    ])

    const rows = Array.from(container.querySelectorAll('li'))
    const lastRow = rows[rows.length - 1]

    expect(lastRow.querySelector('button[aria-label="Add task"]')).not.toBeNull()
  })
})
