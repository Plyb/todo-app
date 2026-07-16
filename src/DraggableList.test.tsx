import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DraggableList } from './DraggableList'

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
  it('renders header and item rows in flat DOM order with matching data attributes', () => {
    const { container } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
      { header: <h2>Section B</h2>, items: [{ id: 3 }] },
    ])

    const rows = Array.from(container.querySelectorAll('li'))
    expect(
      rows.map((li) => ({
        sectionIndex: li.dataset.sectionIndex,
        isItem: li.dataset.itemRow !== undefined,
        text: li.textContent,
      }))
    ).toEqual([
      { sectionIndex: '0', isItem: false, text: 'Section A' },
      { sectionIndex: '0', isItem: true, text: 'Item 1' },
      { sectionIndex: '0', isItem: true, text: 'Item 2' },
      { sectionIndex: '1', isItem: false, text: 'Section B' },
      { sectionIndex: '1', isItem: true, text: 'Item 3' },
    ])
  })

  it('extends the last droppable row (not its visible divider) for a trailing drop zone', () => {
    const { container } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
      { header: <h2>Section B</h2>, items: [{ id: 3 }] },
    ])

    const rows = Array.from(container.querySelectorAll('li'))
    expect(rows[1].style.paddingBottom).toBe('0px') // an ordinary item row's own <li> carries no extra padding
    expect(rows[rows.length - 1].style.paddingBottom).toBe('96px') // last item's <li> extends for the tail drop zone

    // The divider itself lives on an inner wrapper, so it isn't dragged down
    // by the outer <li>'s extended padding.
    const lastInner = rows[rows.length - 1].querySelector('div')!
    expect(lastInner.style.borderBottom).toContain('1px')
    expect(lastInner.style.paddingBottom).toBe('12px')
  })

  it('anchors the trailing drop zone to a header when the final section is empty', () => {
    const { container } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }] },
      { header: <h2>Section B</h2>, items: [] },
    ])

    const rows = Array.from(container.querySelectorAll('li'))
    const last = rows[rows.length - 1]
    expect(last.textContent).toBe('Section B')
    expect(last.style.paddingBottom).toBe('96px')
  })

  it('does not redirect the tail padding onto an earlier row when the trailing row is an expanded panel', () => {
    // Expanding the very last item replaces it with a fully droppable-disabled
    // panel row - if the tail padding fell back to the previous item instead,
    // it would open a phantom gap directly above the (now-displaced) panel.
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
    // No row should carry the 96px tail padding - not the header, not the
    // remaining item, and not the panel itself (which never gets it, being
    // fully droppable-disabled).
    rows.forEach((li) => expect(['', '0px']).toContain(li.style.paddingBottom))
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

    const rows = Array.from(container.querySelectorAll('li'))
    const buttonRow = rows[rows.length - 1]
    expect(buttonRow.style.height).toBe('0px')

    const button = buttonRow.querySelector('button[aria-label="Add task"]')!
    expect(button).not.toBeNull()
    expect((button as HTMLElement).style.position).toBe('fixed')
  })

  it('does not carry the tail-drop-zone padding itself - it lands on the true last item/header instead', () => {
    const { container } = renderWithInsertButton([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
    ])

    const rows = Array.from(container.querySelectorAll('li'))
    const buttonRow = rows[rows.length - 1]
    const lastItemRow = rows[rows.length - 2]

    expect(buttonRow.querySelector('button')).not.toBeNull() // confirms this IS the button row
    expect(['', '0px']).toContain(buttonRow.style.paddingBottom)
    expect(lastItemRow.style.paddingBottom).toBe('96px')
  })
})
