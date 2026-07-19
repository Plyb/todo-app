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
