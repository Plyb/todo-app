import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DraggableList } from './DraggableList'

type Item = { id: number }

function renderList(sections: { header: React.ReactNode; items: Item[] }[]) {
  return render(
    <DraggableList sections={sections} onReorder={() => {}} renderItem={(item: Item) => <span>Item {item.id}</span>} />
  )
}

describe('AnimatedHeader (section header FLIP animation)', () => {
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

  it('snaps a header to its old visual position, then eases it to the new one, when a preceding section shrinks', () => {
    const topByNode = new WeakMap<Element, number>()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = topByNode.get(this) ?? 0
      return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })

    const { rerender } = renderList([
      { header: <h2>Section A</h2>, items: [{ id: 1 }, { id: 2 }] },
      { header: <h2>Section B</h2>, items: [{ id: 3 }] },
    ])

    // AnimatedHeader wraps `children` directly in its own <div>, so the
    // header content's parent IS that wrapper.
    const headerB = screen.getByText('Section B').parentElement!

    // Simulate section A shrinking: on the next render, header B's real
    // (post-layout) position moves up to 40px from wherever it started.
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

    // Synchronously (before the animation frame fires), it should be
    // snapped back to its old visual position via a starting transform.
    expect(headerB.style.transition).toBe('none')
    expect(headerB.style.transform).toBe('translateY(-40px)')

    rafCallback?.(0)

    // Once the frame fires, it eases away from that starting offset to its
    // real (new) position.
    expect(headerB.style.transform).toBe('')
    expect(headerB.style.transition).toBe('transform 200ms ease')
  })

  it('does not animate on initial mount', () => {
    const topByNode = new WeakMap<Element, number>()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = topByNode.get(this) ?? 123
      return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })

    renderList([{ header: <h2>Only Section</h2>, items: [{ id: 1 }] }])

    const header = screen.getByText('Only Section').parentElement!
    expect(header.style.transform).toBe('')
    expect(rafCallback).toBeNull()
  })
})
