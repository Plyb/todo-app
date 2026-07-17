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
  it('renders header + item rows in flat DOM order, with a single tail on the last section', () => {
    const { container } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
      { header: <h2>Section B</h2>, items: [{ id: 3 }] },
    ])

    const rows = Array.from(container.querySelectorAll('li'))
    expect(
      rows.map((li) => ({
        sectionIndex: li.dataset.sectionIndex,
        tail: li.dataset.sectionTail,
        isItem: li.dataset.itemRow !== undefined,
        text: li.textContent,
      }))
    ).toEqual([
      { sectionIndex: '0', tail: undefined, isItem: false, text: 'Section A' },
      { sectionIndex: '0', tail: undefined, isItem: true, text: 'Item 1' },
      { sectionIndex: '0', tail: undefined, isItem: true, text: 'Item 2' },
      { sectionIndex: '1', tail: undefined, isItem: false, text: 'Section B' },
      { sectionIndex: '1', tail: undefined, isItem: true, text: 'Item 3' },
      { sectionIndex: undefined, tail: '1', isItem: false, text: '' },
    ])
  })

  it('emits a single flexible tail on the last section (no padding baked onto the last item)', () => {
    const { container } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
      { header: <h2>Section B</h2>, items: [{ id: 3 }] },
    ])

    // The last item carries only its normal 12px padding - no inflated tail
    // drop zone; the trailing space is a separate tail row instead.
    const item2 = Array.from(container.querySelectorAll('li[data-item-row]')).find((li) => li.textContent === 'Item 2')!
    expect((item2 as HTMLElement).style.paddingBottom).toBe('12px')

    const tails = Array.from(container.querySelectorAll('li[data-section-tail]'))
    // Only the last section has a tail, and it flexes to fill the viewport.
    expect(tails.map((li) => (li as HTMLElement).dataset.sectionTail)).toEqual(['1'])
    expect((tails[0] as HTMLElement).style.flex).toContain('1')
  })

  it('still emits a tail for an empty final section (a drop target with no items)', () => {
    const { container } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }] },
      { header: <h2>Section B</h2>, items: [] },
    ])

    const rows = Array.from(container.querySelectorAll('li'))
    const last = rows[rows.length - 1]
    expect(last.dataset.sectionTail).toBe('1')
    expect(last.textContent).toBe('')
  })

  it('keeps a tail after an expanded panel row', () => {
    const { container } = render(
      <DraggableList
        sections={[{ header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] }]}
        onReorder={() => {}}
        renderItem={(item: Item) => <span>Item {item.id}</span>}
        expandedSlot={{ afterItemId: 2, content: <div>Panel</div> }}
      />
    )

    const rows = Array.from(container.querySelectorAll('li'))
    expect(rows.map((li) => li.textContent)).toEqual(['Section A', 'Item 1', 'Panel', ''])
    expect(rows[rows.length - 1].dataset.sectionTail).toBe('0')
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

  it('sits just before the trailing tail, which stays the array\'s final row', () => {
    const { container } = renderWithInsertButton([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
    ])

    const rows = Array.from(container.querySelectorAll('li'))
    const lastRow = rows[rows.length - 1]
    const secondToLast = rows[rows.length - 2]

    // The tail is the final row so nothing can settle after it; the FAB is
    // right before it.
    expect(lastRow.dataset.sectionTail).toBe('0')
    expect(secondToLast.querySelector('button[aria-label="Add task"]')).not.toBeNull()
  })
})
