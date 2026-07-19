import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LoadMoreSentinel } from './LoadMoreSentinel'

afterEach(cleanup)

// A controllable stand-in for vitest.setup.ts's default (inert) stub: captures
// the observer callback so a test can simulate the sentinel scrolling into view.
function installMockIntersectionObserver() {
  let capturedCallback: IntersectionObserverCallback | null = null
  class MockIntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      capturedCallback = callback
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  const original = globalThis.IntersectionObserver
  globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver

  return {
    triggerIntersection() {
      capturedCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    },
    restore() {
      globalThis.IntersectionObserver = original
    },
  }
}

describe('LoadMoreSentinel', () => {
  it('calls onVisible when the sentinel scrolls into view', () => {
    const mock = installMockIntersectionObserver()
    const onVisible = vi.fn()

    render(<LoadMoreSentinel isLoading={false} onVisible={onVisible} />)
    mock.triggerIntersection()

    expect(onVisible).toHaveBeenCalledTimes(1)
    mock.restore()
  })

  it('does not call onVisible before it becomes visible', () => {
    installMockIntersectionObserver()
    const onVisible = vi.fn()

    render(<LoadMoreSentinel isLoading={false} onVisible={onVisible} />)

    expect(onVisible).not.toHaveBeenCalled()
  })

  it('shows a loading indicator in place of the next page while it is in flight', () => {
    render(<LoadMoreSentinel isLoading={true} onVisible={() => {}} />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders no loading indicator once nothing is in flight', () => {
    render(<LoadMoreSentinel isLoading={false} onVisible={() => {}} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
