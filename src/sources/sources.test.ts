import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

// The sources module delegates to db/*, which caches its IndexedDB connection at
// module scope, so each test gets a fresh database and a fresh module graph.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
})

describe('buildSource', () => {
  it('dispatches an indexeddb configuration to an IndexedDbSource carrying its id', async () => {
    const { buildSource } = await import('./index')

    const source = buildSource({ kind: 'indexeddb', id: 'indexeddb' })

    expect(source.id).toBe('indexeddb')
    expect(typeof source.loadStatuses).toBe('function')
  })

  it('produces a source whose methods round-trip through IndexedDB', async () => {
    const { buildSource, DEFAULT_SOURCE_CONFIG } = await import('./index')
    const source = buildSource(DEFAULT_SOURCE_CONFIG)

    const created = await source.createStatus('Custom', 'custom')
    expect(created).toEqual({ slug: 'custom', name: 'Custom', sourceId: 'indexeddb' })

    const statuses = await source.loadStatuses()
    expect(statuses).toContainEqual({ slug: 'custom', name: 'Custom', sourceId: 'indexeddb' })
  })
})

describe('loadSourceConfigurations', () => {
  it('returns the built-in IndexedDB configuration seeded by migration', async () => {
    const { loadSourceConfigurations } = await import('./index')

    const configs = await loadSourceConfigurations()

    expect(configs).toEqual([{ kind: 'indexeddb', id: 'indexeddb' }])
  })
})

describe('buildSourceRegistry', () => {
  it('keys each built source by its configuration id', async () => {
    const { buildSourceRegistry } = await import('./index')

    const registry = buildSourceRegistry([{ kind: 'indexeddb', id: 'indexeddb' }])

    expect([...registry.keys()]).toEqual(['indexeddb'])
    expect(registry.get('indexeddb')?.id).toBe('indexeddb')
  })
})
