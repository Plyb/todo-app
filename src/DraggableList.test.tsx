import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DraggableList, getInsertSlotAt } from './DraggableList'

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

describe('non-drag reflow animation (hand-rolled FLIP)', () => {
  let rafCallback: FrameRequestCallback | null

  beforeEach(() => {
    rafCallback = null
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallback = cb
      return 0
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function mockTop(topByNode: WeakMap<Element, number>) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = topByNode.get(this) ?? 0
      return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })
  }

  it('snaps a header to its old position, then eases it to the new one, when a preceding section shrinks', () => {
    const topByNode = new WeakMap<Element, number>()
    mockTop(topByNode)

    const { rerender } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
      { header: <h2>Section B</h2>, items: [{ id: 3 }] },
    ])

    const headerB = screen.getByText('Section B').closest('li')!
    topByNode.set(headerB, 40)

    rerender(
      <DraggableList
        sections={[
          { header: <h2>Section A</h2>, items: [{ id: 1 }] },
          { header: <h2>Section B</h2>, items: [{ id: 3 }] },
        ]}
        onReorder={() => {}}
        renderItem={(item: Item) => <span>Item {item.id}</span>}
      />
    )

    expect(headerB.style.transition).toBe('none')
    expect(headerB.style.transform).toBe('translateY(-40px)')

    rafCallback?.(0)

    expect(headerB.style.transform).toBe('')
    expect(headerB.style.transition).toBe('transform 200ms ease')
  })

  it('does not animate on initial mount', () => {
    mockTop(new WeakMap())
    renderList([{ header: <h2>Only Section</h2>, items: [{ id: 1 }] }])

    const header = screen.getByText('Only Section').closest('li')!
    expect(header.style.transform).toBe('')
    expect(rafCallback).toBeNull()
  })

  it('does NOT animate rows while insertSlot is FAB-driven - they snap instantly instead', () => {
    // A live FAB drag resolves a new insertSlot position on every pointermove
    // - far more often than an ease can ever settle between changes.
    // Animating each one both looks chaotic and (more importantly) breaks
    // getInsertSlotAt's own getBoundingClientRect reads, which would
    // otherwise see a mid-flight transformed position instead of the row's
    // true one and feed an incorrect result back into the FAB's own
    // placement decision - so this row must snap, not ease, the whole time
    // insertSlot is present.
    const topByNode = new WeakMap<Element, number>()
    mockTop(topByNode)

    const { rerender } = renderList([{ header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] }])

    const item2Row = screen.getByText('Item 2').closest('li')!
    topByNode.set(item2Row, 60)

    rerender(
      <DraggableList
        sections={[{ header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] }]}
        onReorder={() => {}}
        renderItem={(item: Item) => <span>Item {item.id}</span>}
        insertSlot={{ sectionIndex: 0, index: 1, content: <div>Slot</div> }}
      />
    )

    expect(item2Row.style.transform).toBe('')
    expect(rafCallback).toBeNull()
  })

  it('resumes animating once the FAB drag ends (insertSlot goes back to undefined)', () => {
    const topByNode = new WeakMap<Element, number>()
    mockTop(topByNode)

    const { rerender } = renderList([{ header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] }])

    rerender(
      <DraggableList
        sections={[{ header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] }]}
        onReorder={() => {}}
        renderItem={(item: Item) => <span>Item {item.id}</span>}
        insertSlot={{ sectionIndex: 0, index: 1, content: <div>Slot</div> }}
      />
    )

    const item2Row = screen.getByText('Item 2').closest('li')!
    topByNode.set(item2Row, 60)

    rerender(
      <DraggableList
        sections={[{ header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] }]}
        onReorder={() => {}}
        renderItem={(item: Item) => <span>Item {item.id}</span>}
      />
    )

    // The FAB drag just ended - no catch-up animation for whatever happened
    // while suppressed, but a genuinely NEW reflow after that should still
    // animate normally.
    expect(item2Row.style.transform).toBe('')

    topByNode.set(item2Row, 100)
    rerender(
      <DraggableList
        sections={[{ header: <h2>Section A</h2>, items: [{ id: 3 }, { id: 1 }, { id: 2 }] }]}
        onReorder={() => {}}
        renderItem={(item: Item) => <span>Item {item.id}</span>}
      />
    )

    expect(item2Row.style.transform).toBe('translateY(-40px)')
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
