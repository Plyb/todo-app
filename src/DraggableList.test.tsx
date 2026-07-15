import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { DraggableList, getInsertSlotAt } from './DraggableList'

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

  it('extends the last droppable row so there is a trailing drop zone', () => {
    const { container } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
      { header: <h2>Section B</h2>, items: [{ id: 3 }] },
    ])

    const rows = Array.from(container.querySelectorAll('li'))
    expect(rows[1].style.paddingBottom).toBe('12px') // an ordinary item row
    expect(rows[rows.length - 1].style.paddingBottom).toBe('108px') // last item + tail height
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
})

describe('getInsertSlotAt', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockRects(rectByText: Record<string, { top: number; height: number }>) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const r = rectByText[this.textContent ?? ''] ?? { top: 0, height: 0 }
      return {
        top: r.top,
        bottom: r.top + r.height,
        height: r.height,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: r.top,
        toJSON: () => ({}),
      } as DOMRect
    })
  }

  it('resolves clientY to the section whose group extends past it, and the nearest item midpoint within it', () => {
    const { container } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
      { header: <h2>Section B</h2>, items: [{ id: 3 }] },
    ])
    mockRects({
      'Section A': { top: 0, height: 20 },
      'Item 1': { top: 20, height: 40 }, // midpoint 40
      'Item 2': { top: 60, height: 40 }, // midpoint 80, section A group ends at 100
      'Section B': { top: 100, height: 40 },
      'Item 3': { top: 140, height: 40 }, // midpoint 160, section B group ends at 180
    })

    expect(getInsertSlotAt(container, 50)).toEqual({ sectionIndex: 0, index: 1 })
    expect(getInsertSlotAt(container, 110)).toEqual({ sectionIndex: 1, index: 0 })
  })

  it('defaults to the start of an empty section', () => {
    const { container } = renderList([{ header: <h2>Section A</h2>, items: [] }])
    mockRects({ 'Section A': { top: 0, height: 20 } })

    expect(getInsertSlotAt(container, 15)).toEqual({ sectionIndex: 0, index: 0 })
  })

  it('returns the top-left default when there are no sections at all', () => {
    const { container } = renderList([])

    expect(getInsertSlotAt(container, 100)).toEqual({ sectionIndex: 0, index: 0 })
  })
})
