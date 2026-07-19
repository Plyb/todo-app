import 'fake-indexeddb/auto'

// jsdom doesn't implement ResizeObserver, which @dnd-kit/dom references at
// import time. Provide a no-op stub so components using dnd-kit can render in
// the test environment.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom doesn't implement IntersectionObserver, which LoadMoreSentinel uses to
// detect scroll-triggered pagination. This default stub never fires the
// callback; tests that need to simulate an intersection install their own
// mock (capturing the callback) instead of relying on this one.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    root = null
    rootMargin = ''
    thresholds: ReadonlyArray<number> = []
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as unknown as typeof globalThis.IntersectionObserver
}
