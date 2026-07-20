import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { CollisionPriority } from '@dnd-kit/abstract'
import { DraggableList } from './DraggableList'
import { INSERT_BUTTON_ID, LIST_DROPPABLE_ID } from './drag-utils'

// Capture every useDroppable input while delegating to the real hook, so the
// container's collision priority can be asserted (there's no layout in jsdom to
// exercise real collision detection). Also capture the provider's onDragEnd so
// a synthetic drop can be replayed (jsdom has no layout to drive a real one).
const { droppableInputs, capturedProps } = vi.hoisted(() => ({
  droppableInputs: [] as Array<{ id?: unknown; collisionPriority?: unknown }>,
  capturedProps: { onDragEnd: undefined as ((event: unknown) => void) | undefined },
}))
vi.mock('@dnd-kit/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/react')>()
  return {
    ...actual,
    useDroppable: (input: { id?: unknown; collisionPriority?: unknown }) => {
      droppableInputs.push(input)
      return (actual.useDroppable as (i: unknown) => unknown)(input)
    },
    DragDropProvider: (props: { onDragEnd?: (event: unknown) => void }) => {
      capturedProps.onDragEnd = props.onDragEnd
      return React.createElement(actual.DragDropProvider, props)
    },
  }
})

// isSortable narrows the drag source to a real Sortable instance; the synthetic
// operation replayed below isn't one, so force it true (useSortable stays real
// for rendering).
vi.mock('@dnd-kit/react/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/react/sortable')>()
  return { ...actual, isSortable: () => true }
})

// Not wired up project-wide (vitest.config.ts has no `globals: true`, so
// testing-library's own auto-cleanup can't find a global afterEach to hook
// into) - without this, renders from earlier tests in this file accumulate,
// and any test reusing text content across cases (e.g. "Item 2") ambiguously
// matches leftover DOM from a previous one.
afterEach(cleanup)

type Item = { id: number }
type TestSection = { header?: React.ReactNode; items: Item[]; footer?: React.ReactNode }

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

  it('wraps the rows in a droppable <ul> that grows to fill its parent as the drop-past-end zone', () => {
    const { container } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
      { header: <h2>Section B</h2>, items: [{ id: 3 }] },
    ])

    const list = container.querySelector('ul')!
    expect(list.style.flex).toBe('1 0 auto')
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

  it('renders a section footer (issue #249 loading placeholder) after that section\'s items', () => {
    const { container } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }], footer: <span>Loading A...</span> },
      { header: <h2>Section B</h2>, items: [{ id: 2 }] },
    ])

    const rows = Array.from(container.querySelectorAll('li'))
    expect(rows.map((li) => li.textContent)).toEqual(['Section A', 'Item 1', 'Loading A...', 'Section B', 'Item 2'])
  })

  it('omits the section footer row for a section with no footer', () => {
    const { container } = renderList([{ header: <h2>Section A</h2>, items: [{ id: 1 }] }])

    expect(Array.from(container.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Section A', 'Item 1'])
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

  // Regression for the FAB always inserting at the bottom: the FAB collides with
  // the whole-list container on drop (not the hovered row), so its drop must be
  // resolved from its settled sortable index, never from the container target.
  it('resolves a mid-list FAB drop from its settled index, even though it lands on the container', () => {
    const onRequestInsert = vi.fn()
    // Rows: header:0=0, item1=1, item2=2, header:1=3, item3=4, FAB=5.
    render(
      <DraggableList
        sections={[
          { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
          { header: <h2>Section B</h2>, items: [{ id: 3 }] },
        ]}
        onReorder={() => {}}
        renderItem={(item: Item) => <span>Item {item.id}</span>}
        insertButton={{ onRequestInsert }}
      />
    )

    // FAB settled between item1 and item2 (index 2) but released over the
    // container. The bug routed this to the end of the last section (1, 1);
    // the fix resolves it from the settled index to (0, 1).
    act(() => {
      capturedProps.onDragEnd?.({
        canceled: false,
        operation: {
          source: { id: INSERT_BUTTON_ID, index: 2 },
          target: { id: LIST_DROPPABLE_ID },
          position: { current: { x: 0, y: 0 } },
        },
      })
    })

    expect(onRequestInsert).toHaveBeenCalledWith(0, 1)
  })
})

describe('FAB long-press', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function renderWithLongPress(onFabLongPress: () => void) {
    return render(
      <DraggableList
        sections={[{ header: <h2>Section A</h2>, items: [{ id: 1 }] }]}
        onReorder={() => {}}
        renderItem={(item: Item) => <span>Item {item.id}</span>}
        insertButton={{ onRequestInsert: () => {} }}
        onFabLongPress={onFabLongPress}
      />
    )
  }

  it('fires after the pointer holds still on the FAB past the long-press duration', () => {
    vi.useFakeTimers()
    const onFabLongPress = vi.fn()
    const { container } = renderWithLongPress(onFabLongPress)
    const button = container.querySelector('button[aria-label="Add task"]')!

    fireEvent.pointerDown(button, { clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(500)

    expect(onFabLongPress).toHaveBeenCalledTimes(1)
  })

  // Regression for "long-press without dragging": a press that travels past
  // the same 8px distance that activates a real FAB drag must not also open
  // the source picker.
  it('does not fire when the pointer travels past the 8px drag activation threshold first', () => {
    vi.useFakeTimers()
    const onFabLongPress = vi.fn()
    const { container } = renderWithLongPress(onFabLongPress)
    const button = container.querySelector('button[aria-label="Add task"]')!

    fireEvent.pointerDown(button, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(button, { clientX: 110, clientY: 100 })
    vi.advanceTimersByTime(500)

    expect(onFabLongPress).not.toHaveBeenCalled()
  })

  it('does not fire when the pointer is released before the long-press duration elapses', () => {
    vi.useFakeTimers()
    const onFabLongPress = vi.fn()
    const { container } = renderWithLongPress(onFabLongPress)
    const button = container.querySelector('button[aria-label="Add task"]')!

    fireEvent.pointerDown(button, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(button, { clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(500)

    expect(onFabLongPress).not.toHaveBeenCalled()
  })
})
