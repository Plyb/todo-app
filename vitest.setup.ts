import 'fake-indexeddb/auto'

// Node 24+ ships a global Web Storage `localStorage`, but without a
// `--localstorage-file` it's a non-functional empty object (no getItem/clear),
// and its global getter shadows the one jsdom would otherwise provide - so tests
// that touch localStorage throw "localStorage.clear is not a function". Install a
// spec-compliant in-memory Storage when the environment's one is unusable.
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.clear !== 'function') {
  const createStorage = (): Storage => {
    const store = new Map<string, string>()
    return {
      get length() {
        return store.size
      },
      clear: () => store.clear(),
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      removeItem: (key: string) => void store.delete(key),
      setItem: (key: string, value: string) => void store.set(key, String(value)),
    }
  }

  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, name, { value: createStorage(), configurable: true, writable: true })
  }
}

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
